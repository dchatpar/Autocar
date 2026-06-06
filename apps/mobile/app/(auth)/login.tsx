/**
 * Login screen — email + password.
 *
 * Uses the `useAuth` Zustand store for the auth lifecycle, NOT React
 * Query, so the spinner and error state can be controlled
 * imperatively (and so the user can't trigger parallel logins).
 *
 * Fields are uncontrolled at the implementation level — we keep them
 * in component state and let the OS autofill. The text content type
 * is set to `emailAddress` and `password` so iOS/Android offer
 * the right keyboard and password manager hookup.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  TOUCH_TARGET_LG,
} from "../../constants/theme";

export default function LoginScreen(): React.JSX.Element {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const login = useAuth((s) => s.login);
  const isSubmitting = useAuth((s) => s.isSubmitting);
  const error = useAuth((s) => s.error);

  const handleSubmit = useCallback(async () => {
    if (email.trim().length === 0 || password.length === 0) {
      return;
    }
    try {
      await login(email.trim().toLowerCase(), password);
    } catch {
      // Error is already in store
    }
  }, [email, password, login]);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !isSubmitting;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Text style={styles.logo}>DealerOS</Text>
            <Text style={styles.tagline}>
              Sales floor, lot, and showroom — in your pocket.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              Use the same email you use on the web.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder="you@dealership.com"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                accessibilityLabel="Email"
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.passwordInput]}
                  accessibilityLabel="Password"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                />
                <Pressable
                  onPress={() => setShowPassword((s) => !s)}
                  style={({ pressed }) => [
                    styles.eyeButton,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Text style={styles.eyeText}>
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.primary,
                !canSubmit && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.bgPrimary} />
              ) : (
                <Text style={styles.primaryText}>Sign in</Text>
              )}
            </Pressable>

            <Text style={styles.legal}>
              By continuing, you agree to DealerOS's terms of service and
              privacy policy.
            </Text>
          </View>

          <View style={styles.helpBlock}>
            <Text style={styles.helpTitle}>Need help?</Text>
            <Text style={styles.helpBody}>
              Ask your manager to resend your invite, or visit
              dealeros.app on the web to reset your password.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.xl,
    justifyContent: "center",
  },
  brand: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  logo: {
    color: colors.accent,
    fontSize: 40,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  formCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
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
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    color: colors.textPrimary,
    fontSize: fontSize.base,
  },
  passwordWrap: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 70,
  },
  eyeButton: {
    position: "absolute",
    right: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: "center",
  },
  eyeText: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
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
    fontWeight: fontWeight.medium,
  },
  primary: {
    minHeight: TOUCH_TARGET_LG,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: colors.bgPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  legal: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
  helpBlock: {
    alignItems: "center",
    padding: spacing.lg,
  },
  helpTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  helpBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: "center",
    lineHeight: 20,
  },
});
