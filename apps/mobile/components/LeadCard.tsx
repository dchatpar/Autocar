/**
 * LeadCard — one row in the lead inbox.
 *
 * Layout:
 *   ┌────────────────────────────────────────────┐
 *   │  John Smith                  score 87 (HOT)│
 *   │  2018 F-150 · Source: Web Form             │
 *   │  555-123-4567   · 12m ago                  │
 *   └────────────────────────────────────────────┘
 *
 * Status pill mirrors the web color scheme. Tap height = 88px so
 * it's comfortable to hit in a moving vehicle (sales floor use case).
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  scoreColors,
  spacing,
  TOUCH_TARGET_MD,
} from "../constants/theme";
import type { LeadSummary } from "../lib/api";

const STATUS_LABEL: Record<LeadSummary["status"], string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  TEST_DRIVE: "Test Drive",
  NEGOTIATING: "Negotiating",
  WON: "Won",
  LOST: "Lost",
};

const STATUS_COLOR: Record<LeadSummary["status"], string> = {
  NEW: colors.accent,
  CONTACTED: colors.info,
  QUALIFIED: colors.success,
  TEST_DRIVE: colors.ai,
  NEGOTIATING: colors.warning,
  WON: colors.success,
  LOST: colors.danger,
};

function scoreClassification(score: number): "hot" | "warm" | "cold" | "dead" {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 25) return "cold";
  return "dead";
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  const wk = Math.floor(days / 7);
  if (wk < 4) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString();
}

export interface LeadCardProps {
  lead: LeadSummary;
  vehicleInterestSummary?: string;
}

export function LeadCard({
  lead,
  vehicleInterestSummary,
}: LeadCardProps): React.JSX.Element {
  const router = useRouter();
  const classification = scoreClassification(lead.score);
  const scoreColor = scoreColors[classification];
  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  const statusColor = STATUS_COLOR[lead.status];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${fullName}, status ${STATUS_LABEL[lead.status]}, score ${lead.score}`}
      onPress={() => router.push(`/(app)/leads/${lead.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {fullName}
        </Text>
        <View style={styles.scoreWrap}>
          <View
            style={[styles.scoreBadge, { backgroundColor: `${scoreColor}22`, borderColor: scoreColor }]}
          >
            <Text style={[styles.scoreText, { color: scoreColor }]}>
              {lead.score}
            </Text>
          </View>
        </View>
      </View>

      {vehicleInterestSummary ? (
        <Text style={styles.vehicle} numberOfLines={1}>
          {vehicleInterestSummary}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABEL[lead.status]}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {lead.phone ?? lead.email ?? lead.source ?? "—"}
        </Text>
        <Text style={styles.time}>{timeAgo(lead.updatedAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: TOUCH_TARGET_MD * 2,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderActive,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreBadge: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
  },
  scoreText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  vehicle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
  time: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: "auto",
  },
});
