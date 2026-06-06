/**
 * Settings — account, app version, sign-out.
 *
 * Sign-out is the only "destructive" action so we surface an
 * explicit confirmation dialog. Everything else is read-only.
 */

import React, { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAuth } from "../../hooks/useAuth";
import { API_BASE_URL } from "../../lib/api";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  TOUCH_TARGET_MD,
} from "../../constants/theme";

export default function SettingsScreen(): React.JSX.Element {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const isSubmitting = useAuth((s) => s.isSubmitting);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const version =
    (Constants.expoConfig?.version as string | undefined) ?? "0.1.0";

  const handleSignOut = useCallback(() => {
    Alert.alert(
      "Sign out?",
      "You'll need to sign back in to view your leads and inventory.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async (): Promise<void> => {
            setIsLoggingOut(true);
            try {
              await logout();
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ],
    );
  }, [logout]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Settings</Text>

        <Section title="Account">
          {user ? (
            <>
              <Row label="Name" value={user.name} />
              <Row label="Email" value={user.email} />
              <Row label="Role" value={user.role} />
              <Row label="Dealer ID" value={user.dealerId} mono />
            </>
          ) : (
            <Row label="Status" value="Loading…" />
          )}
        </Section>

        <Section title="App">
          <Row label="Version" value={version} />
          <Row label="API" value={API_BASE_URL} mono />
          <Row label="Platform" value={detectPlatform()} />
        </Section>

        <Section title="About">
          <Text style={styles.about}>
            DealerOS Mobile is the field companion to your CRM. Built for
            sales floors, lots, and showrooms. Scan VINs, capture
            driver's licenses, and respond to leads from anywhere on
            the lot.
          </Text>
        </Section>

        <Pressable
          onPress={handleSignOut}
          disabled={isSubmitting || isLoggingOut}
          style={({ pressed }) => [
            styles.signOut,
            (isSubmitting || isLoggingOut) && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono ? styles.rowValueMono : null,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function detectPlatform(): string {
  if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
    return "React Native";
  }
  return "Unknown";
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
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: TOUCH_TARGET_MD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
  rowValue: {
    color: colors.textPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "60%",
  },
  rowValueMono: {
    fontFamily: "Menlo",
    fontSize: fontSize.sm,
  },
  about: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    lineHeight: 22,
    padding: spacing.lg,
  },
  signOut: {
    minHeight: TOUCH_TARGET_MD + 4,
    backgroundColor: colors.dangerDim,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  signOutText: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
});
