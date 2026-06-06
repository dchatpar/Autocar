"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface LoadingDotsProps extends HTMLAttributes<HTMLSpanElement> {
  /** Optional accessible label override */
  label?: string;
  /** Size of each dot */
  size?: "sm" | "md" | "lg";
  /** Color variant matching design tokens */
  variant?: "default" | "accent" | "muted" | "danger" | "success";
}

const sizeMap: Record<NonNullable<LoadingDotsProps["size"]>, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

const variantMap: Record<NonNullable<LoadingDotsProps["variant"]>, string> = {
  default: "bg-text-primary",
  accent: "bg-accent",
  muted: "bg-text-muted",
  danger: "bg-danger",
  success: "bg-success",
};

/**
 * LoadingDots — three pulsing dots with staggered animation.
 * Used inline (button loading state, header indicator) and standalone.
 *
 * 44px minimum touch target only applies to interactive elements;
 * this is purely decorative.
 */
export function LoadingDots({
  label = "Loading",
  size = "md",
  variant = "default",
  className,
  ...props
}: LoadingDotsProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("inline-flex items-center gap-1.5 align-middle", className)}
      {...props}
    >
      <span
        className={cn(
          "rounded-full animate-pulse",
          sizeMap[size],
          variantMap[variant]
        )}
        style={{ animationDelay: "0ms" }}
      />
      <span
        className={cn(
          "rounded-full animate-pulse",
          sizeMap[size],
          variantMap[variant]
        )}
        style={{ animationDelay: "150ms" }}
      />
      <span
        className={cn(
          "rounded-full animate-pulse",
          sizeMap[size],
          variantMap[variant]
        )}
        style={{ animationDelay: "300ms" }}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
