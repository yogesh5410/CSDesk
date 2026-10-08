"""Parse the "List of courses" PDF into CSE department course rows.

Emits JSON: {"courses": [{course_code, course_name, discipline, program,
             lecture_slot, tutorial_slot, lab_slot, instructors}, ...],
             "skipped": n}

Columns are recovered from word x-positions rather than whitespace, because a
cell can wrap onto several lines and long course names run right up to the
next column. Rows are grouped by vertical gap: lines inside one table row are
~4pt apart, separate rows ~14-18pt.
"""
import json
import re
import sys
from collections import OrderedDict

from pdf_tables import pages, group_lines, clean

# (name, x_min, x_max) - bands measured from the PDF's own header row
COLS = [
    ("course_code", 0, 100), ("course_name", 100, 315), ("ltp", 315, 370),
    ("credits", 370, 443), ("discipline", 443, 508), ("program", 508, 556),
    ("semester", 556, 605), ("category", 605, 695), ("lecture", 695, 812),
    ("tutorial", 812, 925), ("lab", 925, 1006), ("instructor", 1006, 9999),
]
CODE_RE = re.compile(r"^[A-Z]{2,3}[A-Z0-9]?\d{3}(/[A-Z]{2,4}\d{3})?$")
ROW_GAP = 8.0          # vertical gap that separates two table rows


def split_slot_venue(cell):
    """'M12/ED-1 201/202' -> 'M12'.  The venue is dropped; only the slot
    matters for clash detection."""
    cell = cell.strip()
    return cell.split("/", 1)[0].strip() if "/" in cell else cell


def parse(pdf_path):
    rows, total = [], 0
    for words in pages(pdf_path):
        lines = group_lines(words)
        blocks, prev = [], None
        for y, ws in lines:
            if prev is not None and (y - prev) < ROW_GAP:
                blocks[-1].append(ws)
            else:
                blocks.append([ws])
            prev = y

        for block in blocks:
            cells = OrderedDict((c, []) for c, _, _ in COLS)
            for ws in block:
                for xmin, _ymin, xmax, text in ws:
                    cx = (xmin + xmax) / 2
                    for name, lo, hi in COLS:
                        if lo <= cx < hi:
                            cells[name].append(text)
                            break
            row = {k: clean(" ".join(v)) for k, v in cells.items()}
            row["course_code"] = row["course_code"].replace(" ", "")
            if row["course_code"] == "Coursecode":          # header
                continue
            if CODE_RE.match(row["course_code"]):
                total += 1
                rows.append(row)

    # CSE department only: the discipline must name CSE/CS&DS *and* the code
    # must be in the department's own CS*/DS* series. That keeps shared courses
    # like CSL100/MAL400 and drops MAL403/IC105, which Mathematics owns even
    # though CSE students take it.
    courses = [{
        "course_code": r["course_code"],
        "course_name": r["course_name"],
        "discipline": r["discipline"],
        "program": r["program"],
        "lecture_slot": split_slot_venue(r["lecture"]),
        "tutorial_slot": split_slot_venue(r["tutorial"]),
        "lab_slot": split_slot_venue(r["lab"]),
        "instructors": r["instructor"],
    } for r in rows
        if re.search(r"CSE|CS&DS", r["discipline"])
        and re.match(r"^(CS|DS)", r["course_code"])]

    return {"courses": courses, "skipped": total - len(courses)}


if __name__ == "__main__":
    try:
        print(json.dumps(parse(sys.argv[1])))
    except Exception as exc:                       # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
