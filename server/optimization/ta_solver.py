"""TA allocation solver (Google OR-Tools CP-SAT).

Reads one JSON object on stdin, writes newline-delimited JSON to stdout:
progress events while it works, then a single final result event.

  in : {courses, timetable, ta_details, registrations, requirements,
        max_courses_per_ta}
  out: {"type":"progress", "phase":..., "pct":..., "detail":...}
       {"type":"result", "status":..., "allocations":[...], ...}
"""

# ==============================================================================
# IMPORTS & SYSTEM DEPENDENCIES
# ==============================================================================
import json
import re
import sys
from collections import defaultdict

# Google OR-Tools Constraint Programming / Boolean Satisfiability (CP-SAT) engine
from ortools.sat.python import cp_model

# ==============================================================================
# CONSTANTS & DICTIONARIES
# ==============================================================================
# Days of the academic week in chronological order for sorting slots
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

# Set of single-letter identifiers reserved for afternoon 3-hour lab blocks
LAB_SLOTS = set("NOPQRSTUVW")

# Academic and personal honorifics to strip during fuzzy name normalization
TITLES = {"dr", "prof", "mr", "ms", "mrs", "shri", "smt"}

# Administrative placeholders and unassigned markers to ignore during matching
PLACEHOLDERS = {"dpgc", "dugc", "tba", "na", "none", ""}

# ==============================================================================
# OBJECTIVE WEIGHT HIERARCHY (DECADE SCALING)
# ==============================================================================
# Weights are separated by orders of magnitude so that higher-level department
# policies strictly dominate lower-level preferences without interference:
#
# Tier 1 (100,000): Base coverage - every course asking for TAs gets at least one.
# Tier 2 (10,000) : Proportional demand scaling - fair sharing during shortages.
# Tier 3 (1,000)  : Seat filling - incentive to fulfill total requested headcount.
# Tier 4 (200)    : Supervisor priority - thesis advisor wins a contested student.
# Tier 5 (10-100) : Faculty preference ranking - best preferred TAs chosen first.
W_HAS_ANY = 100000
W_SEAT = 1000
W_PREF_TOP = 100
W_PREF_STEP = 5

# Sized strictly above the entire preference range (10-100):
# Rule 3 states that a student's thesis supervisor takes precedence when two
# courses contest the same TA. A +200 bonus guarantees the advisor wins any
# preference contest while still respecting the higher-tier seat-filling terms.
W_SUPERVISOR = 200


# ==============================================================================
# PROGRESS & IPC COMMUNICATION HELPERS
# ==============================================================================
def emit(**payload):
    """Flushes a single JSON message to stdout for inter-process communication.

    The parent Node.js server reads stdout line-by-line to stream live progress
    updates directly to the user's web browser via WebSockets / SSE.
    """
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def progress(phase, pct, detail=""):
    """Emits an incremental progress milestone event (0% to 100%).

    Args:
        phase: High-level stage name ('grid', 'slots', 'model', 'solving', etc.).
        pct: Integer percentage complete.
        detail: Human-readable status description shown on the frontend.
    """
    emit(type="progress", phase=phase, pct=pct, detail=detail)


# ==============================================================================
# FUZZY NAME MATCHING & SUPERVISOR TIE-BREAKING
# ==============================================================================
# Different source documents format faculty names inconsistently (e.g.,
# "Prof. Souradyuti Poul" in timetable vs. "Dr. Souradyuti Paul" in TA list, or
# "Dr. I Vinod Kumar Reddy" vs. "Dr. Vinod Reddy"). These helpers reconcile
# spelling variations and multi-instructor strings reliably.

def tokenize(name):
    """Normalizes a person's name into clean lowercase words, stripping honorifics.

    Removes punctuation, splits by whitespace, and eliminates common academic titles
    (Dr, Prof, Shri) so that only substantive name tokens remain.
    """
    words = re.split(r"[^a-z]+", (name or "").lower())
    return [w for w in words if w and w not in TITLES]


def levenshtein(a, b):
    """Computes the Levenshtein edit distance between two strings.

    Measures the minimum number of single-character edits (insertions, deletions,
    or substitutions) required to transform string `a` into string `b`.
    """
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def same_person(a, b):
    """Fuzzy identity check to verify if two name strings refer to the same faculty.

    1. Tokenizes both strings and filters out administrative placeholders.
    2. Allows a 1-character Levenshtein error on surnames (e.g., Poul vs Paul).
    3. Requires at least one matching given name token.
    4. Handles cases where the catalog lists only a first name ("Prof. Santosh and Dr. Dhiman").
    """
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return False
    if set(ta) & PLACEHOLDERS or set(tb) & PLACEHOLDERS:
        return False
    # If one source gives only a single name token, check for a direct match
    if len(ta) == 1 or len(tb) == 1:
        return bool(set(ta) & set(tb))
    # Surnames must agree within 1 edit distance (allows minor spelling typos)
    if levenshtein(ta[-1], tb[-1]) > 1:
        return False
    # At least one given name must also match
    return bool(set(ta[:-1]) & set(tb[:-1]))


def split_people(raw):
    """Splits a multi-instructor string into clean individual person strings.

    Splits by commas or 'and', strips whitespace, and removes committee placeholders
    such as 'DPGC_CSE', 'DUGC', or 'TBA'.
    """
    if not raw:
        return []
    parts = re.split(r",| and ", raw)
    return [p.strip() for p in parts
            if p.strip() and p.strip().lower() not in PLACEHOLDERS
            and not re.fullmatch(r"(DPGC|DUGC)(_\w+)?", p.strip(), re.I)]


# ==============================================================================
# TIMETABLE GRID INDEXING & COMPOSITE SLOT RESOLUTION
# ==============================================================================
def build_slot_index(timetable):
    """Constructs a lookup dictionary mapping each slot code to its weekly time cells.

    Theory slots (A-M) recur 3 times a week across different days; digits select
    specific weekly occurrences. Lab slots (N-W) run once as a 180-minute block;
    digits select specific hours inside that block. Both are mapped to ordered
    lists of (day, start_time) tuples indexed 1..n.
    """
    order = {d: i for i, d in enumerate(DAYS)}
    theory, lab = defaultdict(list), defaultdict(list)
    for row in timetable:
        key = (order.get(row["day"], 99), row["start_time"])
        cell = (row["day"], row["start_time"])
        if row.get("theory_slot"):
            theory[row["theory_slot"]].append((key, cell))
        if row.get("lab_slot"):
            lab[row["lab_slot"]].append((key, cell))
    index = {}
    for src in (theory, lab):
        for code, items in src.items():
            index[code] = [c for _k, c in sorted(items)]
    return index


TOKEN_RE = re.compile(r"([A-Z]+)(\d*)")


def resolve_slots(spec, index):
    """Resolves complex composite slot strings into an exact set of (day, time) coordinates.

    Supports:
    - Single letters: 'E' -> all 3 lecture hours for slot E.
    - Numbered sub-slots: 'A12' -> occurrences 1 and 2 of slot A.
    - Compound lab strings: 'OWQSU' -> five distinct 3-hour lab blocks.
    - Separator combinations: 'U12, S12' or 'P23 & T23'.
    """
    cells = set()
    for token in re.split(r"[,&\s]+", spec or ""):
        m = TOKEN_RE.fullmatch(token.strip())
        if not m:
            continue
        letters, digits = m.group(1), m.group(2)
        codes = [letters] if (len(letters) == 1 or digits) else list(letters)
        for code in codes:
            occ = index.get(code[0] if len(code) == 1 else code, [])
            if not occ:
                continue
            if digits:
                # Digits 1..len(occ) select specific hours or weekly occurrences
                cells |= {occ[int(d) - 1] for d in digits if 0 < int(d) <= len(occ)}
            else:
                # No digits specified means the entire slot block is occupied
                cells |= set(occ)
    return cells


# ==============================================================================
# CP-SAT SOLUTION CALLBACK FOR LIVE STREAMING
# ==============================================================================
class Reporter(cp_model.CpSolverSolutionCallback):
    """Callback triggered by CP-SAT each time a superior integer solution is found.

    Reports live progress percentages and current objective values back to the
    browser so administrators can observe real-time convergence.
    """

    def __init__(self):
        super().__init__()
        self.count = 0

    def on_solution_callback(self):
        self.count += 1
        progress("solving", min(70 + self.count * 4, 94),
                 f"improved solution #{self.count} "
                 f"(objective {int(self.ObjectiveValue()):,})")


# ==============================================================================
# MAIN SOLVER FUNCTION
# ==============================================================================
def solve(data):
    """Formulates and solves the complete TA allocation problem using CP-SAT.

    Workflow:
    1. Unpack input datasets (courses, timetable, TAs, registrations, requirements).
    2. Build spatial slot index and compute timetable cell footprint for each course.
    3. Determine TA availability: PhD scholars free; M.Tech students busy during class.
    4. Pre-filter candidate pairs into an eligibility list (guarantees zero clashes).
    5. Build CP-SAT model with decision variables, hard bounds, and objective weights.
    6. Solve to global optimality and package detailed result JSON.
    """
    # Unpack input dictionary into indexed lookups
    courses = {c["course_code"]: c for c in data["courses"]}
    tas = {t["roll_no"]: t for t in data["ta_details"] if t.get("roll_no")}
    requirements = data["requirements"]
    max_per_ta = int(data.get("max_courses_per_ta", 1))

    # Phase 1: Build the timetable coordinate grid
    progress("grid", 8, "reading the timetable grid")
    index = build_slot_index(data["timetable"])

    # Phase 2: Resolve spatial timetable footprint (day, start_time) for each course
    progress("slots", 18, f"resolving slots for {len(courses)} courses")
    course_cells = {code: (resolve_slots(c.get("lecture_slot"), index)
                           | resolve_slots(c.get("tutorial_slot"), index)
                           | resolve_slots(c.get("lab_slot"), index))
                    for code, c in courses.items()}

    # Phase 3: Compute TA busy schedules based on enrolled coursework
    progress("availability", 32, "computing TA availability from registrations")
    registered = defaultdict(list)
    for r in data["registrations"]:
        registered[r["student_roll_no"]].append(r["course_code"])

    busy = {}
    for roll, ta in tas.items():
        if (ta.get("program") or "").lower().startswith("p"):
            # PhD scholars have completed coursework and are free in every slot
            busy[roll] = set()
        else:
            # M.Tech students accumulate busy hours from all their enrolled classes
            cells = set()
            for code in registered.get(roll, []):
                cells |= course_cells.get(code, set())
            busy[roll] = cells

    # Phase 4: Parse faculty preference rankings into ordered rank maps
    prefs = {}
    for req in requirements:
        raw = (req.get("preferred_ta_rolls") or "").strip()
        rolls = [p.strip() for p in re.split(r"[;,]", raw) if p.strip()]
        # Rank 1 = most preferred, Rank 2 = second choice, etc.
        prefs[req["course_code"]] = {r: i + 1 for i, r in enumerate(rolls)}

    # Phase 5: Eligibility pre-filtering (Zero Timetable Clashes Guarantee)
    # A TA is eligible for a course if and only if their busy class hours
    # do NOT intersect with the course's lecture, tutorial, or lab hours.
    progress("eligibility", 45, "matching TAs against course timings")
    eligible = defaultdict(list)
    for req in requirements:
        code = req["course_code"]
        cells = course_cells.get(code, set())
        for roll in tas:
            if not (busy[roll] & cells):
                eligible[code].append(roll)

    # Identify courses with zero eligible TAs due to timetable conflicts
    starved = [r["course_code"] for r in requirements if not eligible[r["course_code"]]]

    # Phase 6: Initialize CP-SAT Model & Decision Variables
    progress("model", 58, "building the CP-SAT model")
    model = cp_model.CpModel()
    x = {}

    # Create Boolean decision variables x[roll, code] solely for eligible pairs.
    # x[roll, code] == 1 if TA 'roll' is assigned to course 'code', else 0.
    for req in requirements:
        code = req["course_code"]
        for roll in eligible[code]:
            x[roll, code] = model.NewBoolVar(f"x_{roll}_{code}")

    obj = []
    for req in requirements:
        code = req["course_code"]
        need = int(req["tas_required"])
        assigned = [x[roll, code] for roll in eligible[code]]
        if not assigned:
            continue
        total = sum(assigned)

        # Hard Constraint: Demand ceiling - never allocate more TAs than requested
        model.Add(total <= need)

        # Constraint 1: Base coverage (at least one TA per course).
        # Modeled as a dominant reward (+100,000) rather than a hard constraint so
        # that in an over-demanded semester the solver returns a best-effort
        # feasible solution naming unfulfilled seats instead of crashing.
        has_any = model.NewBoolVar(f"has_{code}")
        model.Add(total >= 1).OnlyEnforceIf(has_any)
        model.Add(total == 0).OnlyEnforceIf(has_any.Not())
        obj.append(W_HAS_ANY * has_any)

        # Constraint 4: Proportional Demand Fulfillment (Diminishing Marginal Rewards)
        # When demand exceeds supply across clashing slots, we reward earlier seats
        # more heavily than later seats, scaled inversely by total course demand.
        # This mathematically forces the solver to balance fulfillment percentages
        # (e.g. allocating 10% to small and 10% to large courses) rather than starving either.
        W_PROPORTIONAL = 10000
        y_vars = []
        for k in range(1, need + 1):
            y = model.NewBoolVar(f"y_{code}_{k}")
            y_vars.append(y)
            # Marginal reward decreases as k increases toward full capacity
            reward = W_SEAT + (W_PROPORTIONAL * (need - k)) // need
            obj.append(reward * y)
        model.Add(sum(y_vars) == total)

        # Soft Objectives: Faculty Preference Ranks & Thesis Supervisor Match
        instructors = split_people(courses.get(code, {}).get("instructors", ""))
        for roll in eligible[code]:
            # Faculty preference bonus: Rank 1 gets +100, Rank 2 gets +95, etc.
            rank = prefs[code].get(roll)
            if rank:
                obj.append(max(W_PREF_TOP - W_PREF_STEP * (rank - 1), 10)
                           * x[roll, code])

            # Thesis supervisor bonus (+200): Outranks preference differences to
            # guarantee the research advisor wins contested student assignments.
            supervisor = tas[roll].get("thesis_supervisor", "")
            if any(same_person(supervisor, i) for i in instructors):
                obj.append(W_SUPERVISOR * x[roll, code])

    # Hard Constraint: TA Workload Cap
    # Restricts each student to at most `max_per_ta` courses (strictly 1).
    # If max_per_ta > 1 is enabled in the future, `AddAtMostOne` guarantees that
    # any two assigned courses do not have overlapping timetable footprints.
    for roll in tas:
        mine = [(code, x[roll, code]) for code in eligible if (roll, code) in x]
        if not mine:
            continue
        model.Add(sum(v for _c, v in mine) <= max_per_ta)
        if max_per_ta > 1:
            for i in range(len(mine)):
                for j in range(i + 1, len(mine)):
                    if course_cells.get(mine[i][0], set()) & course_cells.get(mine[j][0], set()):
                        model.AddAtMostOne([mine[i][1], mine[j][1]])

    # Define the global maximization objective
    model.Maximize(sum(obj))

    # Phase 7: Configure and Run the CP-SAT Multi-Threaded Solver
    progress("solving", 70, f"{len(x):,} decision variables")
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    solver.parameters.num_search_workers = 8  # Parallel CPU portfolio search
    status = solver.Solve(model, Reporter())

    # Phase 8: Solution Extraction & Result Packaging
    progress("collecting", 96, "reading the assignment back")
    allocations, unfilled = [], []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for req in requirements:
            code = req["course_code"]
            got = 0
            instructors = split_people(courses.get(code, {}).get("instructors", ""))
            for roll in eligible[code]:
                if not solver.Value(x[roll, code]):
                    continue
                got += 1
                ta = tas[roll]
                allocations.append({
                    "course_code": code,
                    "course_name": courses.get(code, {}).get("course_name", ""),
                    "instructors": courses.get(code, {}).get("instructors", ""),
                    "ta_roll_no": roll,
                    "ta_name": ta.get("name", ""),
                    "ta_program": ta.get("program", ""),
                    "preference_rank": prefs[code].get(roll),
                    "is_preferred": roll in prefs[code],
                    "is_supervisor": any(
                        same_person(ta.get("thesis_supervisor", ""), i)
                        for i in instructors),
                })
            # Track any shortage where allocated TAs fell short of faculty demand
            if got < int(req["tas_required"]):
                unfilled.append({"course_code": code,
                                 "required": int(req["tas_required"]),
                                 "allocated": got,
                                 "eligible_pool": len(eligible[code])})

    # Sort allocations cleanly by course code and TA roll number
    allocations.sort(key=lambda a: (a["course_code"], a["ta_roll_no"]))
    progress("done", 100, "finished")

    # Return structured result summary dictionary
    return {
        "type": "result",
        "status": solver.StatusName(status),
        "allocations": allocations,
        "unfilled": unfilled,
        "starved": starved,
        "stats": {
            "courses_requesting": len(requirements),
            "seats_requested": sum(int(r["tas_required"]) for r in requirements),
            "seats_filled": len(allocations),
            "tas_available": len(tas),
            "tas_used": len({a["ta_roll_no"] for a in allocations}),
            "preferred_honoured": sum(1 for a in allocations if a["is_preferred"]),
            "supervisor_matches": sum(1 for a in allocations if a["is_supervisor"]),
            "variables": len(x),
            "solve_seconds": round(solver.WallTime(), 2),
        },
    }


# ==============================================================================
# CLI INVOCATION ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    try:
        # Reads input JSON from standard input, solves, and emits result JSON to standard output
        emit(**solve(json.load(sys.stdin)))
    except Exception as exc:                       # noqa: BLE001
        # Catch unexpected runtime exceptions and return a structured ERROR result
        emit(type="result", status="ERROR", message=str(exc),
             allocations=[], unfilled=[], starved=[], stats={})
        sys.exit(1)
