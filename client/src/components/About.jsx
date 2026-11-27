const stack = [
  { label: "Frontend", value: "React + Vite + Tailwind CSS" },
  { label: "Backend", value: "Node.js + Express" },
  { label: "Database", value: "Supabase (PostgreSQL)" },
  { label: "Remote Agent", value: "Python 3 + Systemd Daemon" },
  { label: "Access Control", value: "Student · Faculty · Admin roles" },
];

export default function About() {
  return (
    <section id="about" className="bg-slate-50 py-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            About CSDesk
          </h2>
          <p className="mt-5 text-slate-600 leading-relaxed">
            CSDesk is a B.Tech project built to automate the core operations
            of the Department of Computer Science, IIT Bhilai. It brings
            lab allocation, TA allocation, and remote lab software deployment
            into one role-based web platform.
          </p>
          <p className="mt-4 text-slate-600 leading-relaxed">
            The goal is simple: replace manual, paper-driven processes with a
            single reliable system that students, faculty, and department staff can
            use easily.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Built With
          </h3>
          <dl className="mt-4 divide-y divide-slate-100">
            {stack.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between py-3 text-sm"
              >
                <dt className="text-slate-500">{item.label}</dt>
                <dd className="font-medium text-slate-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
