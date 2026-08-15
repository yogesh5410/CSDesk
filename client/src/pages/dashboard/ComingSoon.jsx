export default function ComingSoon({ title }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-24 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        This module is under development and will be available soon.
      </p>
    </div>
  );
}
