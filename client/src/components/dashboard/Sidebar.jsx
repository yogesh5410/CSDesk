import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import { navItems } from "../../config/navigation";
import { useAuth } from "../../context/AuthContext";

function getInitials(user) {
  const name = user?.user_metadata?.full_name || user?.email || "";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) {
  const { user, signOut } = useAuth();
  const initials = getInitials(user);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-green-900 text-white transition-all duration-200 md:static md:z-auto ${
          collapsed ? "md:w-20" : "md:w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <div
            className={`flex items-center gap-2 overflow-hidden ${
              collapsed ? "md:w-full md:justify-center" : ""
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-bold">
              CS
            </span>
            {!collapsed && (
              <span className="truncate text-lg font-semibold">CSDesk</span>
            )}
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="text-green-200 hover:text-white md:hidden"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navItems.map(({ label, icon: Icon, path, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={onCloseMobile}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-green-200 hover:bg-white/5 hover:text-white"
                } ${collapsed ? "md:justify-center" : ""}`
              }
            >
              <Icon size={19} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-green-200 transition hover:bg-white/5 hover:text-white md:flex ${
              collapsed ? "justify-center" : ""
            }`}
          >
            {collapsed ? (
              <ChevronsRight size={19} />
            ) : (
              <ChevronsLeft size={19} />
            )}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>

        <div
          className={`flex items-center gap-3 border-t border-white/10 px-4 py-4 ${
            collapsed ? "md:justify-center" : ""
          }`}
        >
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
              {initials}
            </span>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.user_metadata?.full_name || "CSDesk User"}
              </p>
              <p className="truncate text-xs text-green-300">
                {user?.email}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={signOut}
            className="shrink-0 text-green-300 hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}
