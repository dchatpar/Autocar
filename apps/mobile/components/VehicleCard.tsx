/**
 * VehicleCard — grid tile for the inventory list.
 *
 * Square aspect ratio so the grid stays uniform. Shows a primary
 * image (or a tinted placeholder block with the initials), then
 * year/make/model/trim and an asking price. Status badge in the
 * top-right.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  TOUCH_TARGET_MD,
} from "../constants/theme";
import type { VehicleSummary } from "../lib/api";

const STATUS_LABEL: Record<VehicleSummary["status"], string> = {
  AVAILABLE: "Available",
  SOLD: "Sold",
  PENDING: "Pending",
  WHOLESALE: "Wholesale",
};

const STATUS_COLOR: Record<VehicleSummary["status"], string> = {
  AVAILABLE: colors.success,
  SOLD: colors.textMuted,
  PENDING: colors.warning,
  WHOLESALE: colors.info,
};

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value.toFixed(0)}`;
}

function formatMileage(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k mi`;
  return `${value} mi`;
}

export interface VehicleCardProps {
  vehicle: VehicleSummary;
}

export function VehicleCard({ vehicle }: VehicleCardProps): React.JSX.Element {
  const router = useRouter();
  const statusColor = STATUS_COLOR[vehicle.status];
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${vehicle.trim ? ` ${vehicle.trim}` : ""}, ${formatPrice(vehicle.askingPrice)}`}
      onPress={() => router.push("/(app)/inventory")}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.imageWrap}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {vehicle.make.slice(0, 1).toUpperCase()}
            {vehicle.model.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABEL[vehicle.status]}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {vehicle.trim ? (
          <Text style={styles.trim} numberOfLines={1}>
            {vehicle.trim}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.price}>{formatPrice(vehicle.askingPrice)}</Text>
          <Text style={styles.mileage}>{formatMileage(vehicle.mileage)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 220,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  pressed: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderActive,
  },
  imageWrap: {
    aspectRatio: 1.4,
    backgroundColor: colors.bgElevated,
    position: "relative",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
  },
  statusPill: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: colors.bgPrimary,
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
  body: {
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: TOUCH_TARGET_MD,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  trim: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  price: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  mileage: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});
