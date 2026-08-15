export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer id="contact" className="bg-slate-900 py-10 text-slate-400">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-center">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-700 text-xs font-bold text-white">
            CS
          </span>
          <span className="text-sm font-semibold text-white">CSDesk</span>
        </div>
        <p className="text-xs">
          Department of Computer Science, IIT Bhilai — B.Tech Project
        </p>
        <p className="text-xs text-slate-500">
          &copy; {year} CSDesk. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
