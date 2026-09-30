import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "info" | "error" | "success";
  children: React.ReactNode;
  className?: string;
};

export function Notice({ variant = "info", children, className }: Props) {
  const Icon = variant === "error" ? CircleAlert : Info;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        variant === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        variant === "success" && "border-primary/30 bg-primary/10",
        variant === "info" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
