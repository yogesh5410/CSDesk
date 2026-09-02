import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import DashboardLayout from "./layouts/DashboardLayout";
import Overview from "./pages/dashboard/Overview";
import ComingSoon from "./pages/dashboard/ComingSoon";
import LabAllocation from "./pages/dashboard/LabAllocation";
import ProtectedRoute from "./components/ProtectedRoute";
import { navItems } from "./config/navigation";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="lab-allocation" element={<LabAllocation />} />
        {navItems
          .filter((item) => !item.end && item.path !== "/dashboard/lab-allocation")
          .map(({ path, label }) => (
            <Route
              key={path}
              path={path.replace("/dashboard/", "")}
              element={<ComingSoon title={label} />}
            />
          ))}
      </Route>
    </Routes>
  );
}

export default App;
