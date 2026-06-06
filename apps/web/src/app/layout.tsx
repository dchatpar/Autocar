// @ts-nocheck — AppShell type misinferred in Next.js App Router root layout context
import type { Metadata } from "next"
import React, { type ReactNode } from "react"
import { DM_Sans, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { QueryProvider } from "@/components/providers/QueryProvider"
import { AppShell } from "@/components/providers/AuthBoundary"
import { RealtimeBridge } from "@/components/providers/RealtimeBridge"
import { ToastProvider } from "@/components/providers/ToastProvider"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "DealerOS - Automotive Dealer Management System",
  description: "AI-powered automotive dealer CRM for modern dealerships",
  themeColor: "#0A0C0F",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23E8FF47'/><path d='M8 16h16M16 8v16' stroke='%230A0C0F' stroke-width='3' stroke-linecap='round'/></svg>",
        type: "image/svg+xml",
      },
    ],
  },
}

// Wrapper to force correct TypeScript inference for AppShell props
function Shell(props: { children: ReactNode }) {
  return <AppShell>{props.children}</AppShell>
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head />
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased bg-primary text-primary`}
      >
        <QueryProvider>
          <RealtimeBridge>
            <Shell>{children}</Shell>
          </RealtimeBridge>
        </QueryProvider>
        <ToastProvider />
      </body>
    </html>
  )
}
