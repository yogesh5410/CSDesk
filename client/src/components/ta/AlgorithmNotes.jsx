import { BookOpen, ArrowRight } from "lucide-react";

const STEPS = [
  {
    n: 1,
    title: "Build the time grid",
    body: "Read timetable rows into a map from slot letter to the (day, period) cells it occupies. Theory slots A–M recur three times a week, so a letter has three occurrences. Lab slots N–W run once for 180 minutes, so a letter covers three consecutive periods on one day.",
  },
  {
    n: 2,
    title: "Resolve every course to concrete time cells",
    body: "A course stores slots as written in the PDF. The digits mean different things by slot type: for theory, M12 means the 1st and 2nd weekly occurrences of M; for a lab, O23 means the 2nd and 3rd hour inside Monday's O block. Union the lecture, tutorial and lab cells to get the course footprint.",
    note: "Lab slots overlay theory slots, so clashes are compared as (day, period) cells — never as slot letters.",
  },
  {
    n: 3,
    title: "Work out when each TA is busy",
    body: "PhD scholars are treated as free in every slot. For an M.Tech student, look up their course registrations, resolve each of those courses to cells, and union them. That set is when they cannot assist.",
  },
  {
    n: 4,
    title: "Filter to eligible (TA, course) pairs",
    body: "A TA is eligible for a course only if their busy cells and the course footprint do not intersect. Ineligible pairs never become variables, which shrinks the model instead of constraining it.",
  },
  {
    n: 5,
    title: "Build the CP-SAT model",
    body: "One boolean x[TA, course] per surviving pair. Hard rules: a course is never over-staffed beyond its request, and a TA takes at most the configured number of courses — and if that is above one, no two of them may overlap in time.",
  },
  {
    n: 6,
    title: "Score the objective",
    body: "Maximised in strict priority: every requesting course getting at least one TA (weight 100000), then each additional filled seat (1000), then the instructor's stated preferences by rank (100 down to 10), then a supervisor bonus (200) when the TA's thesis supervisor teaches that course.",
    note: "The supervisor bonus deliberately outranks the whole preference range, so a contested TA goes to their own supervisor — constraint 3 — while still yielding to filling seats.",
  },
  {
    n: 7,
    title: "Solve and read back",
    body: "CP-SAT searches for the assignment with the highest total score, streaming a progress tick each time it improves. The result records which courses fell short of their request and how large their eligible pool actually was.",
  },
];

export default function AlgorithmNotes() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <BookOpen size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">How the allocator works</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              A constraint-satisfaction model solved with Google OR-Tools CP-SAT.
              Availability is decided before the model is built; preferences and
              the supervisor rule are weights, so contested TAs are resolved
              globally rather than first-come-first-served.
            </p>
          </div>
        </div>
      </div>

      <ol className="space-y-3">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700">
                {s.n}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.body}</p>
                {s.note && (
                  <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <ArrowRight size={16} className="mt-0.5 shrink-0" />
                    <span>{s.note}</span>
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
