/**
 * Root layout — sets up:
 *   - GestureHandlerRootView (required for the bottom tab bar's
 *     swipe-back gesture on iOS and for reanimated)
 *   - SafeAreaProvider (for top/bottom insets)
 *   - QueryClientProvider (server state)
 *   - Theme — dark mode via `expo-status-bar`
 *   - Auth hydration on first mount
 *
 * The Stack is configured with two top-level groups: `(auth)` and
 * `(app)`. The router switches between them based on the
 * `useAuth().status` value. We use `Stack.Screen options={{
 * headerShown: false }}` to keep our custom headers throughout.
 */

import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAuth,
  selectIsAuthenticated,
} from "../hooks/useAuth";
import { colors, fontSize, fontWeight, spacing } from "../constants/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Background refetch when the user comes back to the app.
      refetchOnWindowFocus: false,
      retry: (failureCount: number, err: unknown): boolean => {
        if (
          err instanceof Error &&
          (err.message.includes("401") || err.message.includes("UNAUTHORIZED"))
        ) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <AuthGate />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * AuthGate — subscribes to auth state and redirects between the
 * `(auth)` and `(app)` groups. Mounted once at the root.
 */
function AuthGate(): React.JSX.Element {
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);
  const isAuthed = useAuth(selectIsAuthenticated);
  const segments = useSegments();
  const router = useRouter();

  // Hydrate once on mount.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (status === "loading") return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!isAuthed && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthed && inAuthGroup) {
      router.replace("/(app)");
    }
  }, [isAuthed, status, segments, router]);

  if (status === "loading") {
    return (
      <View style={styles.bootScreen}>
        <Text style={styles.bootLogo}>DealerOS</Text>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.bootHint}>Loading…</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPrimary },
        animation: "fade",
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  bootScreen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  bootLogo: {
    color: colors.accent,
    fontSize: 40,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
  },
  bootHint: {
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
});
