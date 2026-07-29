import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold outline-none transition disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-pine/30",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "bg-pine text-white shadow-sm hover:bg-[#174e3d]",
        variant === "secondary" &&
          "border border-line bg-white text-ink hover:border-[#b8c6bd] hover:bg-fog",
        variant === "ghost" && "text-[#52615a] hover:bg-[#e7ece8]",
        variant === "danger" && "bg-coral text-white hover:bg-[#a84338]",
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
      className={cn(
        "rounded-2xl border border-line bg-white shadow-panel",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide",
        tone === "success" && "border-[#b8d7c9] bg-[#eaf5ef] text-[#28664f]",
        tone === "warning" && "border-[#ead1a9] bg-[#fff5e5] text-[#9c5f17]",
        tone === "danger" && "border-[#edc2bc] bg-[#fff0ee] text-[#a53f33]",
        tone === "info" && "border-[#b8d2df] bg-[#edf6fa] text-[#2f6b86]",
        tone === "neutral" && "border-line bg-fog text-[#66736c]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#e4e9e5]">
      <div
        className="h-full rounded-full bg-pine transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-pine">
          {eyebrow}
        </p>
        <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#66736c]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#c8d1cb] bg-[#fafbfa] px-8 py-14 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="mt-2 text-sm text-[#718078]">{description}</p>
    </div>
  );
}
