import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50",
        variant === "default" && "bg-zinc-900 text-white hover:bg-zinc-800",
        variant === "secondary" && "border border-zinc-300 bg-white hover:bg-zinc-50",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-500",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-zinc-200 bg-white p-4 shadow-sm", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700",
        className,
      )}
      {...props}
    />
  );
}
