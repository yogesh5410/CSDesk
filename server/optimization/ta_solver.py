"""TA allocation solver (Google OR-Tools CP-SAT).

Reads one JSON object on stdin, writes newline-delimited JSON to stdout:
progress events while it works, then a single final result event.

  in : {courses, timetable, ta_details, registrations, requirements,
        max_courses_per_ta}
  out: {"type":"progress", "phase":..., "pct":..., "detail":...}
       {"type":"result", "status":..., "allocations":[...], ...}
"""
import json
import re
import sys
from collections import defaultdict

from ortools.sat.python import cp_model

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
LAB_SLOTS = set("NOPQRSTUVW")
TITLES = {"dr", "prof", "mr", "ms", "mrs", "shri", "smt"}
PLACEHOLDERS = {"dpgc", "dugc", "tba", "na", "none", ""}

# Objective weights. Meeting constraint 1 (every course gets at least one TA)
# dominates everything; after that, filling the full requested headcount; then
# honouring preferences, with the supervisor bonus sized to outrank a few
# places of preference rank so it decides genuine contests.
W_HAS_ANY = 100000
W_SEAT = 1000
W_PREF_TOP = 100
W_PREF_STEP = 5
# Sized above the whole preference range (10-100) on purpose: constraint 3
# says the thesis supervisor wins a contested TA, so a supervisor match has to
# outrank any difference in preference rank, while still yielding to the
# seat-filling terms above.
W_SUPERVISOR = 200


def emit(**payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def progress(phase, pct, detail=""):
    emit(type="progress", phase=phase, pct=pct, detail=detail)


# --------------------------------------------------------------------------
# Name matching: the three source files spell faculty differently
# ("Prof. Souradyuti Poul" / "Dr. Souradyuti Paul", "Dr. I Vinod Kumar Reddy"
# / "Dr. Vinod Reddy"), so the supervisor tie-break cannot use string equality.
# --------------------------------------------------------------------------
def tokenize(name):
    words = re.split(r"[^a-z]+", (name or "").lower())
    return [w for w in words if w and w not in TITLES]


def levenshtein(a, b):
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
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return False
    if set(ta) & PLACEHOLDERS or set(tb) & PLACEHOLDERS:
        return False
    # one source gives only a first name ("Prof. Santosh and Dr. Dhiman")
    if len(ta) == 1 or len(tb) == 1:
        return bool(set(ta) & set(tb))
    if levenshtein(ta[-1], tb[-1]) > 1:          # surnames must agree
        return False
    return bool(set(ta[:-1]) & set(tb[:-1]))     # and one given name too


def split_people(raw):
    if not raw:
        return []
    parts = re.split(r",| and ", raw)
    return [p.strip() for p in parts
            if p.strip() and p.strip().lower() not in PLACEHOLDERS
            and not re.fullmatch(r"(DPGC|DUGC)(_\w+)?", p.strip(), re.I)]


# --------------------------------------------------------------------------
# Slot resolution
# --------------------------------------------------------------------------
def build_slot_index(timetable):
    """slot code -> ordered [(day, start_time)] occurrences.

    Theory slots (A-M) recur three times a week, so digits after the letter
    select which weekly occurrence. Lab slots (N-W) run once for 180 minutes,
    so digits select which hour inside that block. Both end up as the same
    kind of list, indexed 1..n.
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
    """'U12, S12' -> {(day, time), ...};  'OWQSU' -> five whole lab blocks."""
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
                cells |= {occ[int(d) - 1] for d in digits if 0 < int(d) <= len(occ)}
            else:
                cells |= set(occ)
    return cells


class Reporter(cp_model.CpSolverSolutionCallback):
    """Streams a progress tick each time CP-SAT improves the objective."""

    def __init__(self):
        super().__init__()
        self.count = 0

    def on_solution_callback(self):
        self.count += 1
        progress("solving", min(70 + self.count * 4, 94),
                 f"improved solution #{self.count} "
                 f"(objective {int(self.ObjectiveValue()):,})")


def solve(data):
    courses = {c["course_code"]: c for c in data["courses"]}
    tas = {t["roll_no"]: t for t in data["ta_details"] if t.get("roll_no")}
    requirements = data["requirements"]
    max_per_ta = int(data.get("max_courses_per_ta", 1))

    progress("grid", 8, "reading the timetable grid")
    index = build_slot_index(data["timetable"])

    progress("slots", 18, f"resolving slots for {len(courses)} courses")
    course_cells = {code: (resolve_slots(c.get("lecture_slot"), index)
                           | resolve_slots(c.get("tutorial_slot"), index)
                           | resolve_slots(c.get("lab_slot"), index))
                    for code, c in courses.items()}

    progress("availability", 32, "computing TA availability from registrations")
    registered = defaultdict(list)
    for r in data["registrations"]:
        registered[r["student_roll_no"]].append(r["course_code"])

    busy = {}
    for roll, ta in tas.items():
        if (ta.get("program") or "").lower().startswith("p"):
            busy[roll] = set()               # PhD scholars: free in every slot
        else:
            cells = set()
            for code in registered.get(roll, []):
                cells |= course_cells.get(code, set())
            busy[roll] = cells

    # preference lists
    prefs = {}
    for req in requirements:
        raw = (req.get("preferred_ta_rolls") or "").strip()
        rolls = [p.strip() for p in re.split(r"[;,]", raw) if p.strip()]
        prefs[req["course_code"]] = {r: i + 1 for i, r in enumerate(rolls)}

    progress("eligibility", 45, "matching TAs against course timings")
    eligible = defaultdict(list)
    for req in requirements:
        code = req["course_code"]
        cells = course_cells.get(code, set())
        for roll in tas:
            if not (busy[roll] & cells):
                eligible[code].append(roll)

    starved = [r["course_code"] for r in requirements if not eligible[r["course_code"]]]

    progress("model", 58, "building the CP-SAT model")
    model = cp_model.CpModel()
    x = {}
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
        model.Add(total <= need)                       # never over-staff

        # Constraint 1 -- at least one TA -- as a dominant reward rather than a
        # hard rule, so an over-subscribed instance still returns a best-effort
        # answer naming what it could not fill instead of failing outright.
        has_any = model.NewBoolVar(f"has_{code}")
        model.Add(total >= 1).OnlyEnforceIf(has_any)
        model.Add(total == 0).OnlyEnforceIf(has_any.Not())
        obj.append(W_HAS_ANY * has_any)
        
        W_PROPORTIONAL = 10000
        y_vars = []
        for k in range(1, need + 1):
            y = model.NewBoolVar(f"y_{code}_{k}")
            y_vars.append(y)
            # Marginal reward decreases as k increases, achieving proportional distribution
            reward = W_SEAT + (W_PROPORTIONAL * (need - k)) // need
            obj.append(reward * y)
        model.Add(sum(y_vars) == total)

        instructors = split_people(courses.get(code, {}).get("instructors", ""))
        for roll in eligible[code]:
            rank = prefs[code].get(roll)
            if rank:
                obj.append(max(W_PREF_TOP - W_PREF_STEP * (rank - 1), 10)
                           * x[roll, code])
            supervisor = tas[roll].get("thesis_supervisor", "")
            if any(same_person(supervisor, i) for i in instructors):
                obj.append(W_SUPERVISOR * x[roll, code])

    # A TA's own workload cap, and -- when the cap allows two courses -- they
    # must not overlap in time.
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

    model.Maximize(sum(obj))

    progress("solving", 70, f"{len(x):,} decision variables")
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model, Reporter())

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
            if got < int(req["tas_required"]):
                unfilled.append({"course_code": code,
                                 "required": int(req["tas_required"]),
                                 "allocated": got,
                                 "eligible_pool": len(eligible[code])})

    allocations.sort(key=lambda a: (a["course_code"], a["ta_roll_no"]))
    progress("done", 100, "finished")
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


if __name__ == "__main__":
    try:
        emit(**solve(json.load(sys.stdin)))
    except Exception as exc:                       # noqa: BLE001
        emit(type="result", status="ERROR", message=str(exc),
             allocations=[], unfilled=[], starved=[], stats={})
        sys.exit(1)
