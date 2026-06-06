"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  /** Optional `name` for forms / a11y. */
  name?: string;
  /** Optional helper text under the field. */
  helperText?: string;
  /** Visually mark as required. */
  required?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  label,
  error,
  disabled,
  className,
  name,
  helperText,
  required,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("flex flex-col gap-1.5", className)} ref={ref}>
      {label && (
        <label className="text-sm font-medium text-text-primary">
          {label}
          {required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          name={name}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            "w-full h-10 px-3 py-2 bg-bg-elevated border rounded-lg text-left flex items-center justify-between transition-colors duration-150",
            "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error
              ? "border-danger"
              : isOpen
              ? "border-accent"
              : "border-border hover:border-border-active"
          )}
        >
          <span
            className={cn(
              !selectedOption && "text-text-muted"
            )}
          >
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-text-muted transition-transform duration-150",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl animate-slide-in">
            <div className="py-1 max-h-60 overflow-auto">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (!option.disabled) {
                      onChange(option.value);
                      setIsOpen(false);
                    }
                  }}
                  disabled={option.disabled}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-center justify-between hover:bg-bg-elevated transition-colors",
                    option.disabled && "opacity-50 cursor-not-allowed",
                    value === option.value && "bg-bg-elevated text-accent"
                  )}
                >
                  {option.label}
                  {value === option.value && (
                    <Check className="h-4 w-4 text-accent" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}

interface MultiSelectProps {
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  values,
  onChange,
  placeholder = "Select options",
  label,
  disabled,
  className,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter((opt) => values.includes(opt.value));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)} ref={ref}>
      {label && (
        <label className="text-sm font-medium text-text-primary">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            "w-full min-h-[2.5rem] px-3 py-2 bg-bg-elevated border border-border rounded-lg text-left flex flex-wrap items-center gap-1.5 transition-colors duration-150",
            "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            isOpen && "border-accent"
          )}
        >
          {selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-elevated border border-border rounded text-sm"
              >
                {opt.label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleValue(opt.value);
                  }}
                  className="hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className="text-text-muted">{placeholder}</span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-text-muted ml-auto transition-transform duration-150",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl animate-slide-in">
            <div className="py-1 max-h-60 overflow-auto">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  disabled={option.disabled}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-bg-elevated transition-colors",
                    option.disabled && "opacity-50 cursor-not-allowed",
                    values.includes(option.value) && "bg-bg-elevated text-accent"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 border rounded flex items-center justify-center",
                      values.includes(option.value)
                        ? "bg-accent border-accent"
                        : "border-border"
                    )}
                  >
                    {values.includes(option.value) && (
                      <Check className="h-3 w-3 text-bg-primary" />
                    )}
                  </div>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}