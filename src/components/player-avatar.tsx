import { cn } from "@/lib/utils";

type Props = { name: string; avatarUrl?: string | null; className?: string };

export function PlayerAvatar({ name, avatarUrl, className }: Props) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs, no optimization needed
      <img
        src={avatarUrl}
        alt=""
        className={cn("size-10 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
