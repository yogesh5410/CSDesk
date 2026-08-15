import {
  CalendarCheck,
  FlaskConical,
  UsersRound,
  Boxes,
  Contact,
  Search,
  LayoutGrid,
  MonitorDown,
  ShieldCheck,
} from "lucide-react";

const features = [
  {
    icon: CalendarCheck,
    title: "Online Room Booking",
    description:
      "Reserve seminar halls, meeting rooms, and common spaces in real time and avoid double-booking conflicts.",
  },
  {
    icon: FlaskConical,
    title: "Lab Allocation",
    description:
      "Assign lab space and equipment to courses and research groups based on timetable and availability.",
  },
  {
    icon: UsersRound,
    title: "TA Allocation",
    description:
      "Streamline how teaching assistants are matched to courses each semester, end to end.",
  },
  {
    icon: Boxes,
    title: "Inventory Management",
    description:
      "Track department assets, consumables, and equipment requests from a single dashboard.",
  },
  {
    icon: Contact,
    title: "Directory",
    description:
      "A searchable directory of students, faculty, and staff with up-to-date contact information.",
  },
  {
    icon: Search,
    title: "Lost & Found",
    description:
      "Report and search for lost items across the department, with status tracking until resolved.",
  },
  {
    icon: LayoutGrid,
    title: "Seating Arrangement",
    description:
      "Visualize and manage student seating for exams, labs, and classrooms without the manual charts.",
  },
  {
    icon: MonitorDown,
    title: "Automated Lab Software Installation",
    description:
      "Push and track software installations across lab machines remotely, without walking room to room.",
  },
  {
    icon: ShieldCheck,
    title: "Role-Based Access",
    description:
      "Students, faculty, and admins each see the tools and data relevant to their role, and nothing more.",
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Everything the CS Office Needs
          </h2>
          <p className="mt-4 text-slate-600">
            CSDesk replaces scattered spreadsheets and paper forms with one
            connected system built for the department&apos;s day-to-day
            operations.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-slate-200 p-6 transition hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <Icon size={22} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
