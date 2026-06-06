"use client";

import React, { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppLayout } from "@/components/layout";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];

/**
 * PUBLIC_ROUTES — paths that render outside the authenticated AppShell.
 * The pricing page is public marketing; the checkout return URLs are
 * public so a user who signs up mid-checkout can still see them.
 */
const PUBLIC_ROUTES = ["/pricing"];

/**
 * Wraps authenticated routes in the sidebar + top bar shell.
 * Public routes (login, signup, forgot/reset password) skip the shell
 * and render their own centered layout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname?.startsWith(p));
  const isPublicRoute = PUBLIC_ROUTES.some((p) => pathname?.startsWith(p));

  if (isAuthRoute || isPublicRoute) {
    return <>{children}</>;
  }
  return <AppLayout>{children}</AppLayout>;
};
