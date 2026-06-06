"use client";

import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "accent"
  | "ai"
  | "muted"
  | "secondary";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "muted", ...props }, ref) => {
    const variants: Record<BadgeVariant, string> = {
      info: "badge-info",
      warning: "badge-warning",
      success: "badge-success",
      danger: "badge-danger",
      accent: "badge-accent",
      ai: "badge-ai",
      muted: "badge-muted",
      secondary: "badge-secondary",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge };