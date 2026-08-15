import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { navItems } from "../../config/navigation";

export default function Topbar({ onOpenMobileSidebar }) {
  const location = useLocation();
  const current = navItems.find((item) =>
    item.end
      ? location.pathname === item.path
      : location.pathname.startsWith(item.path),
  );
  const title = current?.label || "Dashboard";

  return (
    <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-4">
      <button
        type="button"
        onClick={onOpenMobileSidebar}
        className="text-slate-600 md:hidden"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      <div>
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>Dashboard</span>
          <span>/</span>
          <span className="text-slate-600">{title}</span>
        </nav>
        <h1 className="mt-0.5 text-xl font-semibold text-slate-900">
          {title}
        </h1>
      </div>
    </header>
  );
}
