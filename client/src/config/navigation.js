import {
  LayoutDashboard,
  CalendarCheck,
  FlaskConical,
  UsersRound,
  Boxes,
  Contact,
  Search,
  LayoutGrid,
  MonitorDown,
} from "lucide-react";

export const navItems = [
  { label: "Overview", icon: LayoutDashboard, path: "/dashboard", end: true },
  {
    label: "Room Booking",
    icon: CalendarCheck,
    path: "/dashboard/room-booking",
  },
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
  { label: "Inventory", icon: Boxes, path: "/dashboard/inventory" },
  { label: "Directory", icon: Contact, path: "/dashboard/directory" },
  {
    label: "Lost & Found",
    icon: Search,
    path: "/dashboard/lost-and-found",
  },
  {
    label: "Seating Arrangement",
    icon: LayoutGrid,
    path: "/dashboard/seating",
  },
  {
    label: "Lab Software Installs",
    icon: MonitorDown,
    path: "/dashboard/lab-software",
  },
];
