"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Car,
  GitBranch,
  FileText,
  Handshake,
  Megaphone,
  BarChart3,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, href: "/" },
  { id: "leads", label: "Leads", icon: <Users className="h-5 w-5" />, href: "/leads", badge: 12 },
  { id: "customers", label: "Customers", icon: <UserCircle className="h-5 w-5" />, href: "/customers" },
  { id: "inventory", label: "Inventory", icon: <Car className="h-5 w-5" />, href: "/inventory" },
  { id: "purchase", label: "Purchase from Public", icon: <ShoppingCart className="h-5 w-5" />, href: "/purchase-from-public" },
  { id: "pipeline", label: "Pipeline", icon: <GitBranch className="h-5 w-5" />, href: "/pipeline" },
  { id: "deals", label: "Deals", icon: <FileText className="h-5 w-5" />, href: "/deals" },
  { id: "bhph", label: "BHPH", icon: <Handshake className="h-5 w-5" />, href: "/bhph" },
  { id: "campaigns", label: "Campaigns", icon: <Megaphone className="h-5 w-5" />, href: "/campaigns" },
  { id: "analytics", label: "Analytics", icon: <BarChart3 className="h-5 w-5" />, href: "/analytics" },
  { id: "ai-agents", label: "AI Agents", icon: <Bot className="h-5 w-5" />, href: "/ai-agents", badge: 3 },
];

interface SidebarProps {
  activeItem?: string;
  onItemClick?: (id: string) => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({
  activeItem = "dashboard",
  onItemClick,
  collapsed = false,
  onToggle,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-bg-card border-r border-border flex flex-col transition-all duration-300 z-40",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Car className="h-5 w-5 text-bg-primary" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg text-text-primary">DealerOS</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onItemClick?.(item.id)}
              className={cn(
                "sidebar-item w-full",
                activeItem === item.id && "active",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-accent text-bg-primary rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && item.badge && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Settings at bottom */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => onItemClick?.("settings")}
          className={cn(
            "sidebar-item w-full",
            activeItem === "settings" && "active",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-bg-card border border-border rounded-full flex items-center justify-center hover:bg-bg-elevated transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}