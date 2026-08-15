import { ArrowRight } from "lucide-react";

const stats = [
  { value: "9+", label: "Integrated Modules" },
  { value: "3", label: "Role-Based Access Levels" },
  { value: "1", label: "Unified Platform" },
];

export default function Hero() {
  return (
    <section className="bg-gradient-to-b from-slate-900 to-blue-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <span className="inline-block rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1 text-xs font-medium tracking-wide text-blue-200 uppercase">
          Department of Computer Science · IIT Bhilai
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          One Platform for Every CS Office Workflow
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
          CSDesk brings room booking, lab &amp; TA allocation, inventory,
          directory, lost &amp; found, and more into a single, streamlined
          system for the CS Office.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Explore Modules
            <ArrowRight size={16} />
          </a>
          <a
            href="#about"
            className="rounded-md border border-slate-500 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 hover:bg-white/5"
          >
            Learn More
          </a>
        </div>

        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-6 border-t border-white/10 pt-10">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-bold text-white sm:text-3xl">
                {stat.value}
              </div>
              <div className="mt-1 text-xs text-slate-400 sm:text-sm">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
