"use client";

import { useState, useRef, useEffect, type ReactNode, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

// Radix-style Dropdown Menu API
interface DropdownMenuContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error("DropdownMenu components must be used within a DropdownMenu");
  }
  return context;
}

interface DropdownMenuProps {
  children: ReactNode;
}

function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  
  return (
    <DropdownMenuContext.Provider value={{ open, onOpenChange: setOpen }}>
      <div className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  asChild?: boolean;
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ children, asChild, className, ...props }, ref) => {
    const { onOpenChange } = useDropdownMenuContext();
    
    if (asChild && React.isValidElement(children)) {
      const childProps = (children as React.ReactElement<{ onClick?: () => void; className?: string }>).props;
      return React.cloneElement(children as React.ReactElement<{ onClick?: () => void; className?: string }>, {
        onClick: () => {
          childProps.onClick?.();
          onOpenChange(true);
        }
      });
    }
    
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onOpenChange(true)}
        className={cn("inline-flex items-center justify-center", className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

interface DropdownMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ children, className, align = "start", sideOffset = 4, ...props }, ref) => {
    const { open, onOpenChange } = useDropdownMenuContext();
    const contentRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        const trigger = triggerRef.current;
        const content = contentRef.current;
        
        if (trigger && !trigger.contains(target) && content && !content.contains(target)) {
          onOpenChange(false);
        }
      };

      if (open) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, onOpenChange]);

    if (!open) return null;

    const alignmentClasses = {
      start: "left-0",
      center: "left-1/2 -translate-x-1/2",
      end: "right-0"
    };

    const content = (
      <div
        ref={contentRef}
        className={cn(
          "absolute z-50 mt-2 min-w-[180px] overflow-hidden rounded-lg border border-border bg-bg-card p-1 shadow-xl animate-scale-in",
          alignmentClasses[align],
          className
        )}
        style={{ top: `calc(100% + ${sideOffset}px)` }}
        {...props}
      >
        {children}
      </div>
    );

    return createPortal(content, document.body);
  }
);
DropdownMenuContent.displayName = "DropdownMenuContent";

interface DropdownMenuItemProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}

const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ children, className, disabled, onSelect, ...props }, ref) => {
    const { onOpenChange } = useDropdownMenuContext();
    
    const handleClick = () => {
      if (disabled) return;
      onSelect?.();
      onOpenChange(false);
    };

    return (
      <div
        ref={ref}
        role="menuitem"
        onClick={handleClick}
        className={cn(
          "relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
          disabled
            ? "pointer-events-none opacity-50 cursor-not-allowed"
            : "text-text-primary hover:bg-bg-elevated focus:bg-bg-elevated cursor-pointer",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="label"
      className={cn("px-2 py-1.5 text-xs font-semibold text-[#6B7280]", className)}
      {...props}
    />
  )
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

// Legacy API support - keep for backward compatibility
interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  children?: MenuItem[];
}

interface LegacyDropdownMenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}

export function DropdownMenuLegacy({
  trigger,
  items,
  align = "left",
  className,
}: LegacyDropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveSubmenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    if (item.separator) {
      return <div key={item.id} className="h-px bg-border mx-2 my-1" />;
    }

    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.id} className="relative">
        <button
          onClick={() => {
            if (!item.disabled && !hasChildren) {
              item.onClick?.();
              setIsOpen(false);
              setActiveSubmenu(null);
            }
          }}
          onMouseEnter={() => hasChildren && setActiveSubmenu(item.id)}
          disabled={item.disabled}
          className={cn(
            "w-full px-3 py-2 text-sm flex items-center gap-2 text-left transition-colors",
            item.disabled
              ? "opacity-50 cursor-not-allowed"
              : item.danger
              ? "text-danger hover:bg-danger/10"
              : "text-text-primary hover:bg-bg-elevated",
            hasChildren && "justify-between"
          )}
        >
          {item.icon && (
            <span className="w-4 h-4 flex items-center justify-center">
              {item.icon}
            </span>
          )}
          <span className="flex-1">{item.label}</span>
          {hasChildren && (
            <ChevronRight className="h-4 w-4 text-text-muted" />
          )}
        </button>

        {/* Submenu */}
        {hasChildren && activeSubmenu === item.id && (
          <div
            className={cn(
              "absolute top-0 bg-bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px] animate-fade-in",
              align === "left" ? "left-full ml-1" : "right-full mr-1"
            )}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            {item.children!.map((child) => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("relative inline-block", className)} ref={ref}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50"
            onClick={() => {
              setIsOpen(false);
              setActiveSubmenu(null);
            }}
          >
            <div
              className={cn(
                "absolute bg-bg-card border border-border rounded-lg shadow-xl py-1 min-w-[200px] animate-scale-in",
                align === "left" ? "left-0" : "right-0"
              )}
              style={{
                top: ref.current?.getBoundingClientRect().bottom ?? 0,
                left:
                  align === "left"
                    ? ref.current?.getBoundingClientRect().left ?? 0
                    : undefined,
                right:
                  align === "right"
                    ? window.innerWidth -
                      (ref.current?.getBoundingClientRect().right ?? 0)
                    : undefined,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item) => renderMenuItem(item))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// Simple dropdown for common use cases
interface SimpleDropdownProps {
  options: Array<{
    value: string;
    label: string;
    icon?: ReactNode;
  }>;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SimpleDropdown({
  options,
  value,
  onChange,
  placeholder = "Select",
  className,
}: SimpleDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((opt) => opt.value === value);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full h-9 px-3 bg-bg-elevated border border-border rounded-lg text-left flex items-center gap-2 hover:border-border-active transition-colors"
        )}
      >
        {selected?.icon}
        <span className={cn("flex-1", !selected && "text-text-muted")}>
          {selected?.label || placeholder}
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl py-1 animate-slide-in">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={cn(
                "w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-bg-elevated transition-colors",
                value === option.value && "text-accent bg-bg-elevated"
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Add React import
import * as React from "react";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};

export type { DropdownMenuProps, DropdownMenuTriggerProps, DropdownMenuContentProps, DropdownMenuItemProps };
