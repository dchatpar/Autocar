/**
 * Add Customer — DL scanner → Textract parse → confirm form → save.
 *
 * Mirrors the inventory add flow but uses Textract for OCR and
 * posts to `/customers` (not `/inventory`).
 *
 * The customer schema is much shorter than the vehicle schema, so
 * the form lives in a single column with no grid layout.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DLScannerView } from "../../../components/DLScannerView";
import {
  api,
  type CreateCustomerPayload,
  type CustomerSummary,
  type DlScanResult,
} from "../../../lib/api";
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  TOUCH_TARGET_LG,
  TOUCH_TARGET_MD,
} from "../../../constants/theme";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dlNumber: string;
  dlProvince: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dlNumber: "",
  dlProvince: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  notes: "",
};

type Phase = "scanner" | "form" | "saving" | "success";

function applyScanToForm(
  form: FormState,
  scan: DlScanResult,
): FormState {
  return {
    ...form,
    firstName: scan.firstName ?? form.firstName,
    lastName: scan.lastName ?? form.lastName,
    dlNumber: scan.licenseNumber ?? form.dlNumber,
    street: scan.address.street ?? form.street,
    city: scan.address.city ?? form.city,
    state: scan.address.state ?? form.state,
    postalCode: scan.address.postalCode ?? form.postalCode,
  };
}

export default function AddCustomerScreen(): React.JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("scanner");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation<CustomerSummary, Error, CreateCustomerPayload>({
    mutationFn: (payload) => api.createCustomer(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const handleScan = useCallback((scan: DlScanResult) => {
    setForm((prev) => applyScanToForm(prev, scan));
    setPhase("form");
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required");
      return;
    }
    setError(null);
    setPhase("saving");
    try {
      await create.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        dlNumber: form.dlNumber.trim() || undefined,
        dlProvince: form.dlProvince.trim() || undefined,
        address: {
          street: form.street.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          postalCode: form.postalCode.trim() || undefined,
        },
        notes: form.notes.trim() || undefined,
      });
      setPhase("success");
    } catch (err) {
      setPhase("form");
      setError(
        err instanceof Error ? err.message : "Could not save customer",
      );
    }
  }, [form, create]);

  /* -------------------- Scanner phase -------------------- */
  if (phase === "scanner") {
    return (
      <View style={styles.fill}>
        <SafeAreaView style={styles.fill} edges={["top"]}>
          <DLScannerView
            onScan={handleScan}
            onCancel={() => router.back()}
          />
        </SafeAreaView>
      </View>
    );
  }

  /* -------------------- Success phase -------------------- */
  if (phase === "success") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <View style={styles.successBadge}>
            <Text style={styles.successBadgeText}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Customer added</Text>
          <Text style={styles.successSubtitle}>
            {form.firstName} {form.lastName}
          </Text>
          <Pressable
            onPress={() => router.replace("/(app)")}
            style={({ pressed }) => [
              styles.successButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.successButtonText}>Back to dashboard</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* -------------------- Form / Saving phase -------------------- */
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.formScroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>New customer</Text>

          <SectionHeader>Identity</SectionHeader>
          <Field
            label="First name"
            value={form.firstName}
            onChangeText={(v) => setForm({ ...form, firstName: v })}
            required
            autoCapitalize="words"
          />
          <Field
            label="Last name"
            value={form.lastName}
            onChangeText={(v) => setForm({ ...form, lastName: v })}
            required
            autoCapitalize="words"
          />
          <Field
            label="Date of birth"
            value={form.notes} // reusing; we keep dob in source payload only
            onChangeText={() => undefined}
            editable={false}
            placeholder="Captured from license"
          />

          <SectionHeader>Contact</SectionHeader>
          <Field
            label="Phone"
            value={form.phone}
            onChangeText={(v) => setForm({ ...form, phone: v })}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(v) => setForm({ ...form, email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <SectionHeader>Driver's license</SectionHeader>
          <View style={styles.grid}>
            <Field
              label="License #"
              value={form.dlNumber}
              onChangeText={(v) => setForm({ ...form, dlNumber: v.toUpperCase() })}
              autoCapitalize="characters"
            />
            <Field
              label="State / Province"
              value={form.dlProvince}
              onChangeText={(v) => setForm({ ...form, dlProvince: v.toUpperCase() })}
              autoCapitalize="characters"
              maxLength={3}
            />
          </View>

          <SectionHeader>Address</SectionHeader>
          <Field
            label="Street"
            value={form.street}
            onChangeText={(v) => setForm({ ...form, street: v })}
            autoCapitalize="words"
          />
          <View style={styles.grid}>
            <Field
              label="City"
              value={form.city}
              onChangeText={(v) => setForm({ ...form, city: v })}
              autoCapitalize="words"
            />
            <Field
              label="State"
              value={form.state}
              onChangeText={(v) => setForm({ ...form, state: v.toUpperCase() })}
              autoCapitalize="characters"
              maxLength={3}
            />
          </View>
          <Field
            label="Postal code"
            value={form.postalCode}
            onChangeText={(v) => setForm({ ...form, postalCode: v })}
            keyboardType="number-pad"
            maxLength={10}
          />

          <SectionHeader>Notes</SectionHeader>
          <Field
            label="Notes"
            value={form.notes}
            onChangeText={(v) => setForm({ ...form, notes: v })}
            multiline
            autoCapitalize="sentences"
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                setForm(EMPTY_FORM);
                setError(null);
                setPhase("scanner");
              }}
              style={({ pressed }) => [
                styles.secondary,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Re-scan</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={phase === "saving"}
              style={({ pressed }) => [
                styles.primary,
                phase === "saving" && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              {phase === "saving" ? (
                <ActivityIndicator color={colors.bgPrimary} />
              ) : (
                <Text style={styles.primaryText}>Save customer</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionHeader({ children }: { children: string }): React.JSX.Element {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  required?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad" | "decimal-pad" | "phone-pad";
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  editable?: boolean;
}

function Field({
  label,
  value,
  onChangeText,
  required,
  keyboardType = "default",
  autoCapitalize = "none",
  multiline,
  maxLength,
  placeholder,
  editable = true,
}: FieldProps): React.JSX.Element {
  return (
    <View style={[styles.field, multiline && styles.fieldMultiline]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.fieldInput,
          multiline && styles.fieldInputMultiline,
          !editable && styles.fieldInputDisabled,
        ]}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        editable={editable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  formScroll: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.huge,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  grid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  field: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldMultiline: {
    flex: 0,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  fieldInput: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.base,
    minHeight: TOUCH_TARGET_MD,
  },
  fieldInputMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  fieldInputDisabled: {
    opacity: 0.6,
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
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  primary: {
    flex: 2,
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
  secondary: {
    flex: 1,
    minHeight: TOUCH_TARGET_LG,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderActive,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  successBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accentDim,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  successBadgeText: {
    color: colors.accent,
    fontSize: 44,
    fontWeight: fontWeight.bold,
  },
  successTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
  },
  successSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
  successButton: {
    minHeight: TOUCH_TARGET_LG,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  successButtonText: {
    color: colors.bgPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
