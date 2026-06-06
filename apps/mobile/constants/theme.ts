/**
 * DealerOS mobile design tokens.
 *
 * Mirrors the web `globals.css` `:root` palette so a feature built for
 * one surface looks at home on the other. Everything is dark-mode-first
 * — there is no light variant. Backgrounds are near-black with an
 * electric lime (`#E8FF47`) accent.
 *
 * Why hand-rolled tokens (not a UI kit)?
 *   - Expo/React Native doesn't ship Tailwind. We'd rather keep the
 *     `StyleSheet.create` API surface tight than pull in a heavy
 *     `nativewind`/`tamagui` runtime for one app.
 *   - The web and mobile product share a brand, not a codebase. Tokens
 *     stay in lockstep through a doc-link here.
 *
 * Touch targets: Apple HIG (44pt) and Material Design (48dp) both call
 * for a 44px minimum interactive surface. We use `TOUCH_TARGET` = 48
 * for bottom tab icons (a little breathing room) and `44` for inline
 * tap targets. WCAG 2.5.5 success criterion.
 */

export const colors = {
  bgPrimary: "#0A0C0F",
  bgCard: "#111318",
  bgElevated: "#1A1D24",
  border: "#1E2229",
  borderActive: "#2A2F3A",
  textPrimary: "#E2E8F0",
  textMuted: "#6B7280",
  accent: "#E8FF47",
  accentDim: "rgba(232, 255, 71, 0.15)",
  success: "#22D3A0",
  successDim: "rgba(34, 211, 160, 0.15)",
  info: "#3B82F6",
  infoDim: "rgba(59, 130, 246, 0.15)",
  warning: "#F97316",
  warningDim: "rgba(249, 115, 22, 0.15)",
  danger: "#EF4444",
  dangerDim: "rgba(239, 68, 68, 0.15)",
  ai: "#A855F7",
  aiDim: "rgba(168, 85, 247, 0.15)",
  overlay: "rgba(10, 12, 15, 0.8)",
  transparent: "transparent",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

/**
 * Touch target sizes — WCAG 2.5.5 / Apple HIG / Material Design.
 * Bottom tabs use 48px; inline tap targets use 44px.
 */
export const TOUCH_TARGET_LG = 48;
export const TOUCH_TARGET_MD = 44;
export const TOUCH_TARGET_SM = 36;

/**
 * Animation durations in ms. Keep these tight (100-250ms) — long
 * transitions on a mobile shell feel sluggish, and we don't have
 * desktop's visual budget.
 */
export const duration = {
  instant: 80,
  fast: 150,
  normal: 200,
  slow: 300,
} as const;

export const fontFamily = {
  sans: "System",
  mono: "Menlo",
} as const;

/**
 * Score classification colors used by the lead list and KPI cards.
 * Mirrors the web `leadClassification` palette.
 */
export const scoreColors = {
  hot: colors.danger,
  warm: colors.warning,
  cold: colors.info,
  dead: colors.textMuted,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
