import {
  LayoutDashboard,
  FlaskConical,
  UsersRound,
  MonitorDown,
} from "lucide-react";

export const navItems = [
  { label: "Overview", icon: LayoutDashboard, path: "/dashboard", end: true },
  {
    label: "Lab Allocation",
    icon: FlaskConical,
    path: "/dashboard/lab-allocation",
  },
  {
    label: "TA Allocation",
    icon: UsersRound,
    path: "/dashboard/ta-allocation",
  },
  {
    label: "Lab Software Installs",
    icon: MonitorDown,
    path: "/dashboard/lab-software",
  },
];
