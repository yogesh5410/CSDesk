"""Shared helper: pull word boxes out of a PDF via poppler's pdftotext.

Using -bbox-layout gives every word an (x, y) box, which is what makes the
column detection in parse_courses.py / parse_timetable.py reliable -- plain
text extraction loses the column structure on these two documents.
"""
import os
import re
import subprocess
import tempfile

ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"}
WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>'
)


def clean(s):
    for k, v in ENTITIES.items():
        s = s.replace(k, v)
    return re.sub(r"\s+", " ", s).strip()


def pages(pdf_path):
    """-> [[ (xmin, ymin, xmax, text), ... ], ...] one list of words per page."""
    tmp = tempfile.NamedTemporaryFile(suffix=".html", delete=False)
    tmp.close()
    try:
        subprocess.run(["pdftotext", "-bbox-layout", pdf_path, tmp.name],
                       check=True, capture_output=True)
        html = open(tmp.name, encoding="utf-8").read()
    finally:
        os.unlink(tmp.name)

    out = []
    for page in re.split(r"<page ", html)[1:]:
        words = [(float(a), float(b), float(c), clean(t))
                 for a, b, c, _d, t in WORD_RE.findall(page) if t.strip()]
        words.sort(key=lambda w: (w[1], w[0]))
        out.append(words)
    return out


def group_lines(words, tol=4.0):
    """Group words sharing a baseline into visual lines -> [(y, [words])]."""
    lines = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(w[1] - lines[-1][0]) < tol:
            lines[-1][1].append(w)
        else:
            lines.append([w[1], [w]])
    for _y, ws in lines:
        ws.sort(key=lambda w: w[0])
    return lines
