export default function SkeletonCard() {
    return (
      <div className="rounded-2xl bg-gray-900/80 p-4">
        <div className="space-y-3">
          <div className="h-14 rounded-lg bg-gray-700"></div>
          <div className="h-3 w-11/12 rounded-lg bg-gray-700"></div>
          <div className="h-3 w-8/12 rounded-lg bg-gray-700"></div>
        </div>
      </div>
    );
}