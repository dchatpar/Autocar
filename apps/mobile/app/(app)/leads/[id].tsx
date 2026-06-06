/**
 * Lead detail screen.
 *
 * Reads `id` from the route. Renders:
 *   - Header: full name, status pill, score badge
 *   - Contact card: phone (tappable, tel:), email (tappable, mailto:), source
 *   - Vehicle interest list (if any)
 *   - Recent activity placeholder (TODO: hook to activity timeline API)
 *
 * Offline-first: `useLead` reads from MMKV first via `initialData`,
 * so the detail renders instantly on a warm tap.
 */

import React from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, Stack } from "expo-router";
import { useLead } from "../../../hooks/useLeads";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  scoreColors,
  spacing,
  TOUCH_TARGET_MD,
} from "../../../constants/theme";

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  TEST_DRIVE: "Test drive",
  NEGOTIATING: "Negotiating",
  WON: "Won",
  LOST: "Lost",
};

function scoreClassification(score: number): "hot" | "warm" | "cold" | "dead" {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 25) return "cold";
  return "dead";
}

export default function LeadDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leadQuery = useLead(id ?? "");

  if (leadQuery.isLoading && !leadQuery.data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (leadQuery.isError || !leadQuery.data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ title: "Lead" }} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't load lead</Text>
          <Pressable
            onPress={() => void leadQuery.refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const lead = leadQuery.data;
  const classification = scoreClassification(lead.score);
  const scoreColor = scoreColors[classification];
  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  const statusColor =
    lead.status === "WON"
      ? colors.success
      : lead.status === "LOST"
        ? colors.danger
        : lead.status === "NEGOTIATING"
          ? colors.warning
          : colors.info;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen
        options={{
          title: fullName,
          headerShown: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {fullName}
            </Text>
            <View
              style={[
                styles.scoreBadge,
                { borderColor: scoreColor, backgroundColor: `${scoreColor}22` },
              ]}
            >
              <Text style={[styles.scoreText, { color: scoreColor }]}>
                {lead.score}
              </Text>
            </View>
          </View>
          <View style={[styles.statusPill, { borderColor: statusColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABEL[lead.status] ?? lead.status}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact</Text>
          {lead.phone ? (
            <ContactRow
              label="Phone"
              value={lead.phone}
              onPress={() => {
                void Linking.openURL(`tel:${lead.phone}`);
              }}
            />
          ) : null}
          {lead.email ? (
            <ContactRow
              label="Email"
              value={lead.email}
              onPress={() => {
                void Linking.openURL(`mailto:${lead.email}`);
              }}
            />
          ) : null}
          <ContactRow label="Source" value={lead.source ?? "—"} />
          <ContactRow
            label="Created"
            value={new Date(lead.createdAt).toLocaleString()}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            onPress={() => {
              /* hook to status change modal */
            }}
          >
            <Text style={styles.primaryActionText}>Update status</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryActionText}>Add note</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface ContactRowProps {
  label: string;
  value: string;
  onPress?: () => void;
}

function ContactRow({ label, value, onPress }: ContactRowProps): React.JSX.Element {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.contactRow,
        onPress && pressed ? styles.contactRowPressed : null,
      ]}
      accessibilityRole={onPress ? "link" : "text"}
    >
      <Text style={styles.contactLabel}>{label}</Text>
      <Text style={styles.contactValue} numberOfLines={1}>
        {value}
      </Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.huge,
  },
  header: {
    gap: spacing.md,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  scoreBadge: {
    minWidth: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
  },
  scoreText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: TOUCH_TARGET_MD,
  },
  contactRowPressed: {
    opacity: 0.7,
  },
  contactLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  contactValue: {
    color: colors.textPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    flexShrink: 1,
    textAlign: "right",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  primaryAction: {
    flex: 1,
    minHeight: TOUCH_TARGET_MD,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: colors.bgPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  secondaryAction: {
    flex: 1,
    minHeight: TOUCH_TARGET_MD,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderActive,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  retryButton: {
    minHeight: TOUCH_TARGET_MD,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderActive,
  },
  retryText: {
    color: colors.textPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pressed: {
    opacity: 0.85,
  },
});
