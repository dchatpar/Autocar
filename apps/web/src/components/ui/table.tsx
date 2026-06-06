"use client";

import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function Table({ className, children, ...props }: TableProps) {
  return (
    <div className="w-full overflow-auto">
      <table
        className={cn("w-full border-collapse", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

export function TableHeader({
  className,
  children,
  ...props
}: TableHeaderProps) {
  return (
    <thead
      className={cn("table-header-sticky border-b border-border", className)}
      {...props}
    >
      {children}
    </thead>
  );
}

interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

export function TableBody({ className, children, ...props }: TableBodyProps) {
  return (
    <tbody className={cn("", className)} {...props}>
      {children}
    </tbody>
  );
}

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  onClick?: () => void;
}

export function TableRow({
  className,
  children,
  onClick,
  ...props
}: TableRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors",
        onClick && "cursor-pointer table-row-hover",
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
}

interface TableHeadProps extends HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  align?: "left" | "center" | "right";
}

export function TableHead({
  className,
  children,
  align = "left",
  ...props
}: TableHeadProps) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-" + align,
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  align?: "left" | "center" | "right";
}

export function TableCell({
  className,
  children,
  align = "left",
  ...props
}: TableCellProps) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm text-text-primary",
        "text-" + align,
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}

// Empty state component
interface TableEmptyProps {
  colSpan: number;
  message?: string;
}

export function TableEmpty({
  colSpan,
  message = "No data available",
}: TableEmptyProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-8 text-center text-text-muted"
      >
        {message}
      </td>
    </tr>
  );
}

// Loading state component
interface TableLoadingProps {
  colSpan: number;
  rows?: number;
}

export function TableLoading({
  colSpan,
  rows = 5,
}: TableLoadingProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          {Array.from({ length: colSpan }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-bg-elevated rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}