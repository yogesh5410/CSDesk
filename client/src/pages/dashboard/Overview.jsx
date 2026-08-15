import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { navItems } from "../../config/navigation";

export default function Overview() {
  const { user } = useAuth();
  const firstName =
    user?.user_metadata?.full_name?.split(" ")[0] || "there";
  const modules = navItems.filter((item) => !item.end);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Welcome, {firstName}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Signed in as {user?.email}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ label, icon: Icon, path }) => (
          <Link
            key={path}
            to={path}
            className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-green-300 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-800">
              <Icon size={20} />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">
              {label}
            </h3>
            <p className="mt-1 text-xs text-slate-500">Open module</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
