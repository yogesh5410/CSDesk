import { FlaskConical, UsersRound, MonitorDown } from "lucide-react";

const features = [
  {
    icon: FlaskConical,
    title: "Lab Allocation",
    description:
      "Assign lab space, equipment, and timetables to courses without double-booking conflicts across rooms.",
  },
  {
    icon: UsersRound,
    title: "TA Allocation",
    description:
      "Streamline how teaching assistants are matched to departmental courses each semester, end to end.",
  },
  {
    icon: MonitorDown,
    title: "Lab Software Installs",
    description:
      "Push and track software installations across lab machines remotely, without walking room to room.",
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
            CSDesk replaces scattered spreadsheets and manual processes with
            three connected modules built for the department&apos;s day-to-day operations.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-slate-200 p-6 transition hover:border-green-300 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-800">
                <Icon size={22} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
