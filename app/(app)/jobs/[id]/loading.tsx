export default function JobLoading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-4 w-32" />
      <div className="card space-y-4">
        <div className="skeleton h-7 w-2/3" />
        <div className="skeleton h-4 w-1/2" />
        <div className="flex gap-2">
          <div className="skeleton h-6 w-16" />
          <div className="skeleton h-6 w-16" />
          <div className="skeleton h-6 w-16" />
        </div>
      </div>
      <div className="card space-y-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-4 w-10/12" />
      </div>
    </div>
  );
}
