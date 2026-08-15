import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">
            CS
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-semibold text-slate-900">
              CSDesk
            </span>
            <span className="text-xs text-slate-500">IIT Bhilai</span>
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition hover:text-blue-700"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Link
            to="/login"
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800"
          >
            Sign In
          </Link>
        </div>

        <button
          type="button"
          className="text-slate-700 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-6 pb-4 md:hidden">
          <nav className="flex flex-col gap-3 pt-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-slate-600 hover:text-blue-700"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-md bg-blue-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-800"
            >
              Sign In
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
