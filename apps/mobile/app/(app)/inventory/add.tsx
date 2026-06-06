/**
 * Add Vehicle — VIN scanner → NHTSA lookup → confirm form → save.
 *
 * Phases:
 *   1. scanner    — VINScannerView captures a photo + manual VIN
 *   2. lookup     — useVinLookup hits /inventory/lookup-vin (NHTSA)
 *   3. confirm    — user edits the decoded fields, hits Save
 *   4. success    — confirmation, then back to inventory
 *
 * `useVinLookup` is keyed by the VIN. Once the manual entry is
 * committed, the lookup fires automatically. We render a "Decoding…"
 * placeholder during the round-trip; if the lookup fails (no
 * network, NHTSA down), we still let the user save with empty
 * fields — the server is the source of truth.
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
import { VINScannerView } from "../../../components/VINScannerView";
import {
  useCreateVehicle,
  useVinLookup,
} from "../../../hooks/useInventory";
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
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  mileage: string;
  exteriorColor: string;
  engine: string;
  bodyStyle: string;
  askingPrice: string;
}

const EMPTY_FORM: FormState = {
  vin: "",
  year: "",
  make: "",
  model: "",
  trim: "",
  mileage: "",
  exteriorColor: "",
  engine: "",
  bodyStyle: "",
  askingPrice: "",
};

type Phase = "scanner" | "lookup" | "form" | "saving" | "success" | "error";

export default function AddVehicleScreen(): React.JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("scanner");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const lookup = useVinLookup(form.vin);
  const create = useCreateVehicle();

  const handleScan = useCallback(
    ({ vin }: { vin: string; photoBase64?: string }) => {
      setForm((prev) => ({ ...prev, vin }));
      setPhase("lookup");
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!form.vin || form.vin.length !== 17) {
      setError("VIN must be exactly 17 characters");
      return;
    }
    const yearNum = Number(form.year);
    if (!form.year || !Number.isFinite(yearNum) || yearNum < 1900 || yearNum > 2100) {
      setError("Year is required and must be a valid 4-digit year");
      return;
    }
    if (!form.make.trim() || !form.model.trim()) {
      setError("Make and model are required");
      return;
    }
    setError(null);
    setPhase("saving");
    try {
      const mileageNum = form.mileage ? Number(form.mileage) : undefined;
      const priceNum = form.askingPrice ? Number(form.askingPrice) : undefined;
      await create.mutateAsync({
        vin: form.vin.toUpperCase(),
        year: yearNum,
        make: form.make.trim(),
        model: form.model.trim(),
        trim: form.trim.trim() || undefined,
        mileage:
          mileageNum !== undefined && Number.isFinite(mileageNum)
            ? mileageNum
            : undefined,
        exteriorColor: form.exteriorColor.trim() || undefined,
        engine: form.engine.trim() || undefined,
        bodyStyle: form.bodyStyle.trim() || undefined,
        pricing:
          priceNum !== undefined && Number.isFinite(priceNum)
            ? { askingPrice: priceNum }
            : undefined,
      });
      setPhase("success");
    } catch (err) {
      setPhase("form");
      setError(
        err instanceof Error ? err.message : "Could not save vehicle",
      );
    }
  }, [form, create]);

  /* -------------------- Scanner phase -------------------- */
  if (phase === "scanner") {
    return (
      <View style={styles.fill}>
        <SafeAreaView style={styles.fill} edges={["top"]}>
          <VINScannerView
            onScan={handleScan}
            onCancel={() => router.back()}
            onError={(msg) =>
              Alert.alert("VIN Scanner", msg, [{ text: "OK" }])
            }
          />
        </SafeAreaView>
      </View>
    );
  }

  /* -------------------- Lookup phase -------------------- */
  if (phase === "lookup") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.lookupTitle}>Looking up VIN…</Text>
          <Text style={styles.lookupSubtitle}>{form.vin}</Text>
        </View>
        <LookupBridge
          lookup={lookup}
          onReady={(prefill) => {
            setForm((prev) => ({ ...prev, ...prefill }));
            setPhase("form");
          }}
          onSkip={() => setPhase("form")}
        />
      </SafeAreaView>
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
          <Text style={styles.successTitle}>Vehicle added</Text>
          <Text style={styles.successSubtitle}>
            {form.year} {form.make} {form.model}
          </Text>
          <Pressable
            onPress={() => router.replace("/(app)/inventory")}
            style={({ pressed }) => [
              styles.successButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.successButtonText}>Back to inventory</Text>
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
          <Text style={styles.title}>New vehicle</Text>
          <Text style={styles.vinLabel}>VIN</Text>
          <Text style={styles.vinValue}>{form.vin}</Text>

          <View style={styles.grid}>
            <Field
              label="Year"
              value={form.year}
              onChangeText={(v) => setForm({ ...form, year: v.replace(/[^0-9]/g, "").slice(0, 4) })}
              keyboardType="number-pad"
              maxLength={4}
              required
            />
            <Field
              label="Mileage"
              value={form.mileage}
              onChangeText={(v) => setForm({ ...form, mileage: v.replace(/[^0-9]/g, "") })}
              keyboardType="number-pad"
            />
          </View>

          <Field
            label="Make"
            value={form.make}
            onChangeText={(v) => setForm({ ...form, make: v })}
            required
            autoCapitalize="words"
          />
          <Field
            label="Model"
            value={form.model}
            onChangeText={(v) => setForm({ ...form, model: v })}
            required
            autoCapitalize="words"
          />
          <Field
            label="Trim"
            value={form.trim}
            onChangeText={(v) => setForm({ ...form, trim: v })}
            autoCapitalize="words"
          />

          <View style={styles.grid}>
            <Field
              label="Color"
              value={form.exteriorColor}
              onChangeText={(v) => setForm({ ...form, exteriorColor: v })}
              autoCapitalize="words"
            />
            <Field
              label="Body"
              value={form.bodyStyle}
              onChangeText={(v) => setForm({ ...form, bodyStyle: v })}
              autoCapitalize="words"
            />
          </View>

          <Field
            label="Engine"
            value={form.engine}
            onChangeText={(v) => setForm({ ...form, engine: v })}
          />

          <Field
            label="Asking price"
            value={form.askingPrice}
            onChangeText={(v) => setForm({ ...form, askingPrice: v.replace(/[^0-9.]/g, "") })}
            keyboardType="decimal-pad"
            prefix="$"
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
                <Text style={styles.primaryText}>Save vehicle</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ============================================================
 * LookupBridge — invisible component that listens to the lookup
 * query and advances to the form phase once the data lands.
 * ============================================================ */

interface LookupBridgeProps {
  lookup: ReturnType<typeof useVinLookup>;
  onReady: (prefill: Partial<FormState>) => void;
  onSkip: () => void;
}

function LookupBridge({
  lookup,
  onReady,
  onSkip,
}: LookupBridgeProps): null {
  React.useEffect(() => {
    if (lookup.isError) {
      // Server unreachable or VIN malformed — skip straight to form.
      onSkip();
      return;
    }
    if (lookup.data) {
      const prefill: Partial<FormState> = {
        ...(lookup.data.year ? { year: String(lookup.data.year) } : {}),
        ...(lookup.data.make ? { make: lookup.data.make } : {}),
        ...(lookup.data.model ? { model: lookup.data.model } : {}),
        ...(lookup.data.trim ? { trim: lookup.data.trim } : {}),
        ...(lookup.data.engine ? { engine: lookup.data.engine } : {}),
        ...(lookup.data.bodyStyle ? { bodyStyle: lookup.data.bodyStyle } : {}),
      };
      onReady(prefill);
    }
  }, [lookup.data, lookup.isError, onReady, onSkip]);
  return null;
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  required?: boolean;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  maxLength?: number;
  prefix?: string;
}

function Field({
  label,
  value,
  onChangeText,
  required,
  keyboardType = "default",
  autoCapitalize = "none",
  maxLength,
  prefix,
}: FieldProps): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? " *" : ""}
      </Text>
      <View style={styles.fieldInputWrap}>
        {prefix ? <Text style={styles.fieldPrefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          style={[styles.fieldInput, prefix ? styles.fieldInputWithPrefix : null]}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          maxLength={maxLength}
          placeholderTextColor={colors.textMuted}
        />
      </View>
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
  lookupTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  lookupSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontFamily: "Menlo",
    letterSpacing: 2,
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
  },
  vinLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vinValue: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: "Menlo",
    letterSpacing: 1.5,
    marginTop: -spacing.sm,
  },
  grid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  field: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  fieldInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  fieldPrefix: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    paddingLeft: spacing.md,
  },
  fieldInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.base,
    minHeight: TOUCH_TARGET_MD,
  },
  fieldInputWithPrefix: {
    paddingLeft: spacing.xs,
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
