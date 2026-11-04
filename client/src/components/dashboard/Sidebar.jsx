import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import { navItems } from "../../config/navigation";
import { useAuth } from "../../context/AuthContext";
import { apiGet } from "../../lib/api";

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
  const { user, role, simulatedUser, switchRole, switchSimulatedEmail, signOut } = useAuth();
  const initials = getInitials(user);

  const [availableUsers, setAvailableUsers] = useState([]);

  useEffect(() => {
    // Fetch users list for impersonation/testing
    apiGet("/api/ta/users/by-role")
      .then((res) => {
        if (res?.users) setAvailableUsers(res.users);
      })
      .catch(() => {});
  }, []);

  const facultyUsers = availableUsers.filter((u) => u.role === "faculty");
  const taUsers = availableUsers.filter((u) => u.role === "ta");

  function handleRoleChange(newRole) {
    if (newRole === "faculty" && facultyUsers.length > 0) {
      switchRole(newRole, facultyUsers[0].email);
    } else if (newRole === "ta" && taUsers.length > 0) {
      switchRole(newRole, taUsers[0].email);
    } else {
      switchRole(newRole, "");
    }
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-green-900 text-white transition-all duration-200 md:sticky md:top-0 md:h-screen md:z-40 ${
          collapsed ? "md:w-20" : "md:w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-4 py-5 shrink-0">
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

        {/* Role Switcher for Testing & Display */}
        {!collapsed && (
          <div className="mx-3 mb-2 rounded-xl bg-white/10 p-2.5 text-xs space-y-2 shrink-0">
            <div className="flex items-center justify-between text-green-200">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Testing Role</span>
              <span className="rounded bg-green-500/30 px-1.5 py-0.5 font-bold uppercase text-white">
                {role}
              </span>
            </div>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-green-950/80 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-white"
            >
              <option value="admin">admin</option>
              <option value="faculty">faculty</option>
              <option value="ta">ta</option>
              <option value="student">student</option>
            </select>

            {/* When Faculty role is chosen, allow picking any specific Faculty member */}
            {role === "faculty" && facultyUsers.length > 0 && (
              <div className="pt-1 border-t border-white/10">
                <span className="block text-[10px] text-green-300 mb-1 font-medium">Impersonate Faculty:</span>
                <select
                  value={simulatedUser || facultyUsers[0]?.email}
                  onChange={(e) => switchSimulatedEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-green-950/80 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-white truncate"
                >
                  {facultyUsers.map((f) => (
                    <option key={f.email} value={f.email}>
                      {f.name} ({f.email.split("@")[0]})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* When TA role is chosen, allow picking any specific TA */}
            {role === "ta" && taUsers.length > 0 && (
              <div className="pt-1 border-t border-white/10">
                <span className="block text-[10px] text-green-300 mb-1 font-medium">Impersonate TA:</span>
                <select
                  value={simulatedUser || taUsers[0]?.email}
                  onChange={(e) => switchSimulatedEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-green-950/80 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-white truncate"
                >
                  {taUsers.map((t) => (
                    <option key={t.email} value={t.email}>
                      {t.name} ({t.email.split("@")[0]})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

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

        <div className="border-t border-white/10 px-3 py-3 shrink-0">
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
          className={`flex items-center gap-3 border-t border-white/10 px-4 py-4 shrink-0 bg-green-950/40 ${
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
