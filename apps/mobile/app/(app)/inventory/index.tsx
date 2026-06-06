/**
 * Inventory grid — 2-up on phones, 3-up on tablets.
 *
 * The grid lives behind a `+` FAB (floating action button) that
 * routes to the VIN scanner. We don't put the scanner in this
 * file because the camera permission flow needs the full screen,
 * and a route-based split is cleaner than a modal.
 *
 * Empty / loading states match the lead inbox style.
 */

import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { VehicleCard } from "../../../components/VehicleCard";
import { useInventory } from "../../../hooks/useInventory";
import type { VehicleSummary } from "../../../lib/api";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  TOUCH_TARGET_LG,
} from "../../../constants/theme";

export default function InventoryScreen(): React.JSX.Element {
  const router = useRouter();
  const inventory = useInventory();

  const onEndReached = useCallback((): void => {
    if (inventory.hasNextPage && !inventory.isFetchingNextPage) {
      void inventory.fetchNextPage();
    }
  }, [inventory]);

  const vehicles: VehicleSummary[] =
    inventory.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>
          {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} on the lot
        </Text>
      </View>
      <FlatList
        data={vehicles}
        keyExtractor={(v) => v.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <VehicleCard vehicle={item} />
          </View>
        )}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={onEndReached}
        refreshControl={
          <RefreshControl
            refreshing={inventory.isFetching && !inventory.isFetchingNextPage}
            onRefresh={() => void inventory.refetch()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          inventory.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.emptyBody}>
                Hit the + button to scan a VIN and add your first vehicle.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          inventory.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null
        }
      />
      <Pressable
        onPress={() => router.push("/(app)/inventory/add")}
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Scan VIN to add a vehicle"
      >
        <Ionicons name="add" size={32} color={colors.bgPrimary} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96, // leave room for FAB
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cell: {
    flex: 1,
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
  fab: {
    position: "absolute",
    bottom: spacing.xl,
    right: spacing.xl,
    width: TOUCH_TARGET_LG + 12,
    height: TOUCH_TARGET_LG + 12,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
  },
});
