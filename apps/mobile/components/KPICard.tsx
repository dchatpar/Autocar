/**
 * KPICard — small dashboard metric tile.
 *
 * Sized to two-up on phones in portrait (with `flex: 1`) and four-up
 * on tablets. Touch target is 88px tall — slightly larger than the
 * 44px WCAG minimum to give the dashboard enough visual weight.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, fontWeight, radius, spacing } from "../constants/theme";

export type KpiTone = "accent" | "info" | "success" | "warning" | "danger" | "ai";

const toneToColor: Record<KpiTone, string> = {
  accent: colors.accent,
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  ai: colors.ai,
};

const toneToDim: Record<KpiTone, string> = {
  accent: colors.accentDim,
  info: colors.infoDim,
  success: colors.successDim,
  warning: colors.warningDim,
  danger: colors.dangerDim,
  ai: colors.aiDim,
};

export interface KPICardProps {
  label: string;
  value: string | number;
  delta?: string;
  tone?: KpiTone;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function KPICard({
  label,
  value,
  delta,
  tone = "accent",
  onPress,
  accessibilityHint,
}: KPICardProps): React.JSX.Element {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? "button" : "summary"}
      accessibilityLabel={`${label}: ${value}${delta ? `, ${delta}` : ""}`}
      accessibilityHint={accessibilityHint}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.card,
        onPress && pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.accent, { backgroundColor: toneToColor[tone] }]} />
      <View style={styles.body}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {delta ? (
          <View style={[styles.delta, { backgroundColor: toneToDim[tone] }]}>
            <Text style={[styles.deltaText, { color: toneToColor[tone] }]}>
              {delta}
            </Text>
          </View>
        ) : null}
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 96,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderActive,
  },
  accent: {
    width: 3,
    borderRadius: radius.sm,
  },
  body: {
    flex: 1,
    justifyContent: "space-between",
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    color: colors.textPrimary,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  delta: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  deltaText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
