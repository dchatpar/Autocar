"use client";

import { type HTMLAttributes, forwardRef } from "react";
import { cn, getInitials } from "@/lib/utils";

export type AvatarStatus = "online" | "away" | "offline" | "busy";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  status?: AvatarStatus;
  statusPosition?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      alt,
      name,
      size = "md",
      status,
      statusPosition = "bottom-right",
      ...props
    },
    ref
  ) => {
    const sizes = {
      sm: "h-8 w-8 text-xs",
      md: "h-10 w-10 text-sm",
      lg: "h-12 w-12 text-base",
      xl: "h-16 w-16 text-lg",
    };

    const statusSizes = {
      sm: "h-2 w-2",
      md: "h-2.5 w-2.5",
      lg: "h-3 w-3",
      xl: "h-4 w-4",
    };

    const statusColors = {
      online: "bg-success",
      away: "bg-warning",
      offline: "bg-text-muted",
      busy: "bg-danger",
    };

    const statusPositions = {
      "bottom-right": "bottom-0 right-0",
      "bottom-left": "bottom-0 left-0",
      "top-right": "top-0 right-0",
      "top-left": "top-0 left-0",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full overflow-hidden bg-bg-elevated",
          sizes[size],
          className
        )}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt={alt || name || "Avatar"}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-medium text-text-primary">
            {name ? getInitials(name) : "?"}
          </span>
        )}

        {status && (
          <span
            className={cn(
              "absolute rounded-full border-2 border-bg-card",
              statusSizes[size],
              statusColors[status],
              statusPositions[statusPosition]
            )}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

// Avatar group component
interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  avatars: Array<{
    src?: string;
    name?: string;
    alt?: string;
  }>;
  max?: number;
  size?: "sm" | "md" | "lg";
}

export function AvatarGroup({
  avatars,
  max = 4,
  size = "md",
  className,
  ...props
}: AvatarGroupProps) {
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div
      className={cn("flex -space-x-2", className)}
      {...props}
    >
      {visible.map((avatar, i) => (
        <Avatar
          key={i}
          src={avatar.src}
          name={avatar.name}
          alt={avatar.alt}
          size={size}
          className="ring-2 ring-bg-card"
        />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-bg-elevated border-2 border-bg-card font-medium text-text-muted",
            size === "sm" && "h-8 w-8 text-xs",
            size === "md" && "h-10 w-10 text-sm",
            size === "lg" && "h-12 w-12 text-base"
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}

export { Avatar };