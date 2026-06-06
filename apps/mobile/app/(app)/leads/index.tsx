/**
 * Lead inbox — the sales floor's home base.
 *
 * Top: filter chips (status, min score) — kept to one row of pills
 *      to maximize vertical real estate for the list.
 * Body: infinite-scroll FlatList of LeadCard rows.
 * Empty: a sales-floor friendly "all clear" panel.
 *
 * State:
 *   - filter is held in `useState` and passed to `useLeads`. Changing
 *     the filter invalidates the React Query key, which triggers a
 *     refetch. We do this rather than mutating the cache to keep
 *     the URL bookmarkable (the filter chips write to
 *     `useLocalSearchParams`).
 *
 * Pull-to-refresh forces a refetch of page 0 and resets the
 * accumulator.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { LeadCard } from "../../../components/LeadCard";
import { useLeads } from "../../../hooks/useLeads";
import type { LeadSummary } from "../../../lib/api";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  TOUCH_TARGET_MD,
} from "../../../constants/theme";

type StatusFilter =
  | "ALL"
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "TEST_DRIVE"
  | "NEGOTIATING"
  | "WON"
  | "LOST";

const STATUS_CHIPS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "TEST_DRIVE", label: "Test drive" },
  { value: "NEGOTIATING", label: "Negotiating" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export default function LeadsScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ status?: string; minScore?: string }>();
  const initialStatus = ((): StatusFilter => {
    const s = (params.status ?? "ALL").toString();
    return STATUS_CHIPS.find((c) => c.value === s)?.value ?? "ALL";
  })();
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [minScore, setMinScore] = useState<number | null>(
    params.minScore ? Number(params.minScore) : null,
  );
  const [search, setSearch] = useState<string>("");

  const filter = {
    ...(status !== "ALL" ? { status } : {}),
    ...(minScore !== null ? { minScore } : {}),
  };
  const leads = useLeads(filter);

  const onEndReached = useCallback((): void => {
    if (leads.hasNextPage && !leads.isFetchingNextPage) {
      void leads.fetchNextPage();
    }
  }, [leads]);

  const allLeads: LeadSummary[] =
    leads.data?.pages.flatMap((p) => p.data) ?? [];

  const filtered = search.trim()
    ? allLeads.filter((l) => {
        const q = search.trim().toLowerCase();
        return (
          `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
          (l.email?.toLowerCase().includes(q) ?? false) ||
          (l.phone?.toLowerCase().includes(q) ?? false)
        );
      })
    : allLeads;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Leads</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email, or phone"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search leads"
        />
        <View style={styles.chipRow}>
          {STATUS_CHIPS.map((chip) => {
            const active = chip.value === status;
            return (
              <Pressable
                key={chip.value}
                onPress={() => setStatus(chip.value)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && styles.chipTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Min score</Text>
          {[null, 25, 50, 75].map((s) => {
            const active = minScore === s;
            return (
              <Pressable
                key={s === null ? "all" : s}
                onPress={() => setMinScore(s)}
                style={({ pressed }) => [
                  styles.scoreChip,
                  active && styles.scoreChipActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.scoreChipText,
                    active && styles.scoreChipTextActive,
                  ]}
                >
                  {s === null ? "Any" : `${s}+`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LeadCard lead={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        onEndReachedThreshold={0.4}
        onEndReached={onEndReached}
        refreshControl={
          <RefreshControl
            refreshing={leads.isFetching && !leads.isFetchingNextPage}
            onRefresh={() => void leads.refetch()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          leads.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No leads match</Text>
              <Text style={styles.emptyBody}>
                Try clearing the filter chips, or pull to refresh.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          leads.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Separator(): React.JSX.Element {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  search: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.base,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    minHeight: TOUCH_TARGET_MD - 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  scoreLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginRight: spacing.xs,
  },
  scoreChip: {
    minWidth: 56,
    minHeight: TOUCH_TARGET_MD - 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreChipActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  scoreChipText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  scoreChipTextActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
  },
  sep: {
    height: spacing.sm,
  },
  empty: {
    padding: spacing.huge,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  footer: {
    padding: spacing.lg,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.85,
  },
});
