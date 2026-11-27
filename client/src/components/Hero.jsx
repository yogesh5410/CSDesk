import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const stats = [
  { value: "3", label: "Integrated Modules" },
  { value: "320+", label: "Lab Computers" },
  { value: "1", label: "Unified Platform" },
];

export default function Hero() {
  return (
    <section className="bg-gradient-to-b from-slate-900 to-green-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <span className="inline-block rounded-full border border-green-400/30 bg-green-400/10 px-4 py-1 text-xs font-medium tracking-wide text-green-300 uppercase">
          Department of Computer Science · IIT Bhilai
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          One Platform for CS Department Operations
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-slate-300">
          CSDesk brings lab allocation, TA allocation, and remote lab software
          installs into a single, streamlined system for the CS Office.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-600"
          >
            Sign In to Dashboard
            <ArrowRight size={16} />
          </Link>
          <a
            href="#features"
            className="rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:bg-white/5"
          >
            Explore Modules
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
