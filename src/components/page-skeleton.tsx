// Placeholder for the first moment of a new device, while it gets its session (AutoSession).
// No text: the page is shown before the language is known to matter.
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="h-7 w-2/3 animate-pulse rounded-md bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
