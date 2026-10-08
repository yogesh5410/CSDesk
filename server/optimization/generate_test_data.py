"""Regenerate the uploadable test CSVs in "Test data/" from live database state.

Reads courses, the timetable grid and the faculty roll straight out of the
database (so the fixtures always agree with what the app is actually holding),
plus the raw TA roster from Data/. Writes the three files the UI accepts as
CSV uploads:

    ta_details.csv          roll_no, name, program, thesis_supervisor, email
    course_registration.csv student_roll_no, course_code
    ta_requirements.csv     course_code, tas_required, preferred_ta_rolls

Course and timetable CSVs are deliberately NOT produced: those two inputs are
uploaded as the original PDFs.

    cd server/optimization && ./venv/bin/python generate_test_data.py
"""
import csv
import json
import os
import random
import re
import sys
import urllib.request
from collections import defaultdict

from ta_solver import build_slot_index, resolve_slots, same_person, split_people

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "Test data")
SOURCE_TA = os.path.join(ROOT, "Data", "Details - TA_Details.csv")

random.seed(20260905)


def env(name):
    for line in open(os.path.join(HERE, "..", ".env"), encoding="utf-8"):
        line = line.strip()
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1]
    raise SystemExit(f"{name} missing from server/.env")


URL, KEY = env("SUPABASE_URL"), env("SUPABASE_KEY")


def rest(path):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def write_csv(name, header, rows):
    path = os.path.join(OUT, name)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print(f"  {name:<26} {len(rows):>4} rows")


# --------------------------------------------------------------------------
# 1. Pull the state the fixtures have to agree with
# --------------------------------------------------------------------------
courses = rest("courses?select=*&limit=10000")
timetable = rest("timetable?select=*&order=id&limit=10000")
faculty = rest("users?select=name,email&role=eq.faculty&limit=10000")

if not courses or not timetable:
    raise SystemExit("Upload the two PDFs first -- courses/timetable are empty.")

print(f"database: {len(courses)} courses, {len(timetable)} timetable cells, "
      f"{len(faculty)} faculty")

index = build_slot_index(timetable)
by_code = {c["course_code"]: c for c in courses}

cells = {}
for c in courses:
    cells[c["course_code"]] = (resolve_slots(c.get("lecture_slot"), index)
                               | resolve_slots(c.get("tutorial_slot"), index)
                               | resolve_slots(c.get("lab_slot"), index))

scheduled = [c for c in courses if cells[c["course_code"]]]
btech = [c for c in scheduled if re.search(r"btech", c.get("program") or "", re.I)]
# blank program = a programme elective, which is taught at M.Tech level
mtech = [c for c in scheduled
         if re.search(r"mtech", c.get("program") or "", re.I)
         or not (c.get("program") or "").strip()]

os.makedirs(OUT, exist_ok=True)
print(f"\nwriting to {OUT}/")

# --------------------------------------------------------------------------
# 2. ta_details.csv -- the real roster, reduced to the five upload columns
# --------------------------------------------------------------------------
tas, dropped, seen = [], [], set()
with open(SOURCE_TA, encoding="utf-8") as fh:
    for i, rec in enumerate(csv.DictReader(fh), start=2):
        roll = (rec["Roll No"] or "").strip()
        name = re.sub(r"\s+", " ", rec["Name"] or "").strip()
        if not roll:
            dropped.append(f"line {i}: '{name}' has no roll number")
            continue
        if roll in seen:
            dropped.append(f"line {i}: roll {roll} already used by another student "
                           f"('{name}' vs '{seen and next(t['name'] for t in tas if t['roll'] == roll)}')")
            continue
        seen.add(roll)
        raw_program = (rec["Program"] or "").strip()
        program = ("PhD" if "phd" in raw_program.lower()
                   else "MTech" if "tech" in raw_program.lower() else raw_program)
        email = (rec["Email ID"] or "").strip()
        if not email and re.fullmatch(r"[MP]\d{2}(CS|DS)\d{3}", roll):
            email = f"{roll}@iitbhilai.ac.in"
        tas.append({
            "roll": roll, "name": name, "program": program,
            "supervisor": re.sub(r"\s+", " ", rec["Thesis Supervisor"] or "").strip().lstrip('"'),
            "email": email, "discipline": (rec["Discipline"] or "").strip(),
        })

write_csv("ta_details.csv",
          ["roll_no", "name", "program", "thesis_supervisor", "email"],
          [[t["roll"], t["name"], t["program"], t["supervisor"], t["email"]] for t in tas])

mtechs = [t for t in tas if t["program"] == "MTech"]
phds = [t for t in tas if t["program"] == "PhD"]

# --------------------------------------------------------------------------
# 3. course_registration.csv -- M.Tech only, and clash-free against the grid
# --------------------------------------------------------------------------
dsai_pool = [c["course_code"] for c in mtech if "DSAI" in (c.get("discipline") or "")]
cse_pool = [c["course_code"] for c in mtech
            if "DSAI" not in (c.get("discipline") or "") or "&" in (c.get("discipline") or "")]


def basket(pool, target):
    chosen, used = [], set()
    for code in random.sample(pool, len(pool)):
        if cells[code] & used:
            continue
        chosen.append(code)
        used |= cells[code]
        if len(chosen) == target:
            break
    return sorted(chosen)


registrations, registered = [], {}
for t in mtechs:
    pool = dsai_pool if "Data Science" in t["discipline"] else cse_pool
    picks = basket(pool, random.choice([3, 3, 4]))
    registered[t["roll"]] = picks
    registrations += [[t["roll"], code] for code in picks]

write_csv("course_registration.csv", ["student_roll_no", "course_code"], registrations)

# --------------------------------------------------------------------------
# 4. ta_requirements.csv
# --------------------------------------------------------------------------
# Headcount follows the shape of the course: a lab needs more hands, and
# CSL100 runs six parallel batches across five lab blocks.
def headcount(course):
    if course["course_code"] == "CSL100/MAL400":
        return 6
    return 3 if (course.get("lab_slot") or "").strip() else 2


requesting = btech + [c for c in mtech if c["course_code"] in ("CSL605", "DSL501")]
requesting.sort(key=lambda c: c["course_code"])

supervisees = defaultdict(list)
for t in tas:
    for sup in split_people(t["supervisor"]):
        supervisees[sup].append(t)


def own_students(course):
    out = []
    for teacher in split_people(course.get("instructors", "")):
        for sup, students in supervisees.items():
            if same_person(sup, teacher):
                out += students
    seen_roll, unique = set(), []
    for t in out:
        if t["roll"] not in seen_roll:
            seen_roll.add(t["roll"])
            unique.append(t)
    return unique


prefs = {}
for course in requesting:
    need = headcount(course)
    mine = own_students(course)
    random.shuffle(mine)
    picks = mine[:need + 1]
    rest_pool = [t for t in tas if t not in picks]
    picks += random.sample(rest_pool, max(0, (need + 2) - len(picks)))
    prefs[course["course_code"]] = [t["roll"] for t in picks]

# Put a few students on a second course that runs at the same time, so the
# supervisor tie-break in constraint 3 has something real to decide.
contested = 0
for i, a in enumerate(requesting):
    if contested >= 3:
        break
    for b in requesting[i + 1:]:
        if not (cells[a["course_code"]] & cells[b["course_code"]]):
            continue
        shared = next((t for t in own_students(a)
                       if t["roll"] in prefs[a["course_code"]]
                       and t["roll"] not in prefs[b["course_code"]]), None)
        if shared:
            prefs[b["course_code"]].append(shared["roll"])
            contested += 1
            break

write_csv("ta_requirements.csv",
          ["course_code", "tas_required", "preferred_ta_rolls"],
          [[c["course_code"], headcount(c), ";".join(prefs[c["course_code"]])]
           for c in requesting])

# --------------------------------------------------------------------------
print(f"\nTAs      : {len(tas)} usable ({len(phds)} PhD always free, "
      f"{len(mtechs)} M.Tech slot-constrained)")
print(f"demand   : {sum(headcount(c) for c in requesting)} seats across "
      f"{len(requesting)} courses")
print(f"contested: {contested} preferences deliberately overlapped")
if dropped:
    print("\nrows excluded from the roster (source data problems):")
    for d in dropped:
        print("  -", d)
