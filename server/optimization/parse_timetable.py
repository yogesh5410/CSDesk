"""Parse the institute common timetable PDF into a day x period grid.

Emits JSON: {"periods": [...], "rows": [{day, start_time, end_time,
             theory_slot, lab_slot}, ...]}

The grid holds two kinds of slot. Theory slots (A-M, X) are 50-55 min and sit
in exactly one period. Lab slots (N-W) are 180 min, so their label is drawn
once, centred across three periods -- which is why they are placed by whether
they fall in the morning or afternoon half rather than by nearest column.
"""
import json
import re
import sys

from pdf_tables import pages, group_lines

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})-?$")
LAB_SLOTS = set("NOPQRSTUVW")


def to24(text):
    """'2:30-' -> '14:30'. The teaching day runs 08:30-17:25, so any hour
    below 8 is afternoon."""
    h, m = TIME_RE.match(text).groups()
    h = int(h)
    if h < 8:
        h += 12
    return f"{h:02d}:{m}"


def parse(pdf_path):
    words = [w for page in pages(pdf_path) for w in page]

    # --- locate the header row of times, which defines the period columns ---
    times = [w for w in words if TIME_RE.match(w[3])]
    if not times:
        raise ValueError("no time labels found - is this the timetable PDF?")
    header_y = min(w[1] for w in times)
    header = [w for w in times if w[1] < header_y + 30]

    cols = []                      # [{x, start, end}] one per period
    for xmin, ymin, xmax, text in sorted(header, key=lambda w: w[0]):
        cx = (xmin + xmax) / 2
        hit = next((c for c in cols if abs(c["x"] - cx) < 25), None)
        if hit is None:
            cols.append({"x": cx, "times": [(ymin, text)]})
        else:
            hit["times"].append((ymin, text))
    for c in cols:
        c["times"].sort()
        c["start"] = to24(c["times"][0][1])
        c["end"] = to24(c["times"][-1][1]) if len(c["times"]) > 1 else ""
    cols.sort(key=lambda c: c["x"])
    if len(cols) < 4:
        raise ValueError(f"expected ~8 period columns, found {len(cols)}")

    # Split the day into halves at the lunch break. The columns are drawn at
    # even x-spacing, so the break is only visible in the times: every period
    # abuts the next by ~5 min, except across lunch.
    def minutes(hhmm):
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)

    breaks = [(minutes(cols[i + 1]["start"]) - minutes(cols[i]["end"]), i)
              for i in range(len(cols) - 1)]
    split_at = max(breaks)[1] + 1
    half_x = (cols[split_at - 1]["x"] + cols[split_at]["x"]) / 2

    # A 180-minute lab block is the run of periods ending at the close of its
    # half -- morning labs finish at lunch, afternoon labs at end of day.
    LAB_MINUTES = 180

    def lab_span(half):
        span, total = [], 0
        for i in reversed(half):
            span.insert(0, i)
            total = minutes(cols[span[-1]]["end"]) - minutes(cols[span[0]]["start"])
            if total >= LAB_MINUTES - 15:
                break
        return span

    morning = lab_span(list(range(0, split_at)))
    afternoon = lab_span(list(range(split_at, len(cols))))

    # --- day rows -------------------------------------------------------
    day_y = {}
    for _xmin, ymin, _xmax, text in words:
        if text in DAYS and text not in day_y and ymin > header_y:
            day_y[text] = ymin
    missing = [d for d in DAYS if d not in day_y]
    if missing:
        raise ValueError(f"day rows not found: {missing}")

    grid = {d: {i: {"theory": "", "lab": ""} for i in range(len(cols))} for d in DAYS}
    for day, y in day_y.items():
        band = [w for w in words
                if abs(w[1] - y) < 20 and re.fullmatch(r"[A-Z]", w[3])]
        for xmin, _ymin, xmax, letter in band:
            cx = (xmin + xmax) / 2
            if letter in LAB_SLOTS:
                for i in (morning if cx < half_x else afternoon):
                    grid[day][i]["lab"] = letter
            else:
                nearest = min(range(len(cols)),
                              key=lambda i: abs(cols[i]["x"] - cx))
                grid[day][nearest]["theory"] = letter

    rows = []
    for day in DAYS:
        for i, col in enumerate(cols):
            rows.append({
                "day": day,
                "start_time": col["start"],
                "end_time": col["end"],
                "theory_slot": grid[day][i]["theory"],
                "lab_slot": grid[day][i]["lab"],
            })
    return {"periods": [{"start_time": c["start"], "end_time": c["end"]}
                        for c in cols],
            "rows": rows}


if __name__ == "__main__":
    try:
        print(json.dumps(parse(sys.argv[1])))
    except Exception as exc:                       # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
