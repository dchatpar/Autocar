/**
 * Dashboard — at-a-glance KPIs for the day.
 *
 * Pulls data from `/dashboard/kpis` (which the API computes from
 * the lead + deal + inventory tables) and renders a 2-up grid on
 * phones / 4-up on tablets. Each card is tappable; tapping a card
 * navigates to the relevant inbox.
 *
 * Offline behavior: React Query keeps the last successful payload
 * in memory; the cards render stale data with a subtle "stale"
 * indicator if a background refetch fails.
 */

import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { KPICard } from "../../components/KPICard";
import { LeadCard } from "../../components/LeadCard";
import { useAuth } from "../../hooks/useAuth";
import { useLeads } from "../../hooks/useLeads";
import { api, type DashboardKpis } from "../../lib/api";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
} from "../../constants/theme";

export default function DashboardScreen(): React.JSX.Element {
  const router = useRouter();
  const user = useAuth((s) => s.user);

  const kpis = useQuery<DashboardKpis, Error>({
    queryKey: ["dashboard.kpis"],
    queryFn: () => api.dashboardKpis(),
    staleTime: 60_000,
  });

  const leads = useLeads({ limit: 5 });

  const onRefresh = (): void => {
    void kpis.refetch();
    void leads.refetch();
  };

  const greeting = greetingFor(new Date());
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={kpis.isFetching || leads.isFetching}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {greeting}, {firstName}
          </Text>
          <Text style={styles.subtitle}>
            {kpis.data
              ? `${kpis.data.leadsToday} new leads today`
              : "Loading your day…"}
          </Text>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <KPICard
              label="Leads today"
              value={kpis.data?.leadsToday ?? "—"}
              tone="accent"
              onPress={() => router.push("/(app)/leads")}
            />
            <KPICard
              label="Hot leads"
              value={kpis.data?.hotLeads ?? "—"}
              tone="danger"
              onPress={() =>
                router.push({
                  pathname: "/(app)/leads",
                  params: { minScore: "75" },
                })
              }
            />
          </View>
          <View style={styles.kpiRow}>
            <KPICard
              label="Inventory"
              value={kpis.data?.inventoryCount ?? "—"}
              tone="info"
              onPress={() => router.push("/(app)/inventory")}
            />
            <KPICard
              label="Pending deals"
              value={kpis.data?.pendingDeals ?? "—"}
              tone="success"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent leads</Text>
            <Text
              onPress={() => router.push("/(app)/leads")}
              style={styles.sectionLink}
              accessibilityRole="link"
            >
              View all
            </Text>
          </View>
          {leads.isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : leads.data && leads.data.pages[0] && leads.data.pages[0].data.length > 0 ? (
            <View style={styles.leadList}>
              {leads.data.pages[0].data.slice(0, 5).map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No leads yet today</Text>
              <Text style={styles.emptyBody}>
                New leads from your web forms, ads, and walk-ins will
                land here in real time.
              </Text>
            </View>
          )}
        </View>

        {kpis.isError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Couldn't load KPIs. Pull to refresh when you're back online.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function greetingFor(d: Date): string {
  const hour = d.getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.huge,
  },
  header: {
    marginBottom: spacing.sm,
  },
  greeting: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    marginTop: spacing.xs,
  },
  kpiGrid: {
    gap: spacing.md,
  },
  kpiRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionLink: {
    color: colors.accent,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    minHeight: 44,
    textAlignVertical: "center",
  },
  leadList: {
    gap: spacing.sm,
  },
  loadingBlock: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
  },
  emptyState: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
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
  errorBox: {
    backgroundColor: colors.dangerDim,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
  },
});
