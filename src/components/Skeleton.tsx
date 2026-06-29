'use client';

// Lightweight loading placeholders so pages show structure instantly on slow
// networks instead of a blank spinner. Pure CSS (Tailwind animate-pulse), no JS.

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white animate-pulse">
      {/* Header row */}
      <div className="flex gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded bg-gray-200" />
        ))}
      </div>
      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-gray-100 px-4 py-4">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="h-3 flex-1 rounded bg-gray-100"
              style={{ width: c === 0 ? '60%' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 h-3 w-1/2 rounded bg-gray-200" />
          <div className="mb-2 h-6 w-2/3 rounded bg-gray-100" />
          <div className="h-3 w-1/3 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
