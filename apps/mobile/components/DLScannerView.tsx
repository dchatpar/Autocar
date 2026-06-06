/**
 * DLScannerView — driver's license scanner.
 *
 * Workflow:
 *   1. Frame the license in the viewfinder.
 *   2. Hit Capture. The photo (base64) goes to the server at
 *      `/customers/scan-dl`, which calls AWS Textract (or returns
 *      a deterministic mock in dev).
 *   3. The parsed fields come back as `DlScanResult` and bubble up
 *      to the parent via `onScan`.
 *
 * Why no client-side OCR? Same rationale as VIN: keep the bundle
 * lean, centralise the call, and gain audit logging for free.
 *
 * Edge cases:
 *   - Blurry capture → user can retake, photo is rejected by the
 *     server if the parse confidence is below 0.5.
 *   - Server timeout (Textract has a 30s soft cap) → we surface a
 *     retry button.
 *   - Permission denied → fallback to "type manually" path.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
} from "expo-camera";
import {
  colors,
  duration,
  fontSize,
  fontWeight,
  radius,
  spacing,
  TOUCH_TARGET_LG,
  TOUCH_TARGET_MD,
} from "../constants/theme";
import { api, ApiClientError, type DlScanResult } from "../lib/api";

export interface DLScannerViewProps {
  onScan: (result: DlScanResult) => void;
  onCancel: () => void;
}

type Phase = "camera" | "submitting" | "manual" | "error";

export function DLScannerView({
  onScan,
  onCancel,
}: DLScannerViewProps): React.JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("camera");
  const [error, setError] = useState<string | null>(null);
  const [manualFirstName, setManualFirstName] = useState<string>("");
  const [manualLastName, setManualLastName] = useState<string>("");
  const [manualLicense, setManualLicense] = useState<string>("");
  const cameraRef = useRef<CameraView | null>(null);
  const [facing] = useState<CameraType>("back");

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    setPhase("submitting");
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85,
        skipProcessing: false,
      });
      if (!photo?.base64) {
        throw new Error("Camera returned no image data");
      }
      const result = await api.scanDl(photo.base64);
      onScan(result);
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? `Could not process image: ${err.message}`
            : "Could not process image",
      );
    }
  }, [onScan]);

  const submitManual = useCallback(() => {
    // The server route returns a normalised DlScanResult. The manual
    // path builds a minimal version client-side so the parent form
    // can be filled the same way regardless of input source.
    const result: DlScanResult = {
      firstName: manualFirstName.trim() || null,
      lastName: manualLastName.trim() || null,
      fullName: [manualFirstName, manualLastName].filter(Boolean).join(" ") || null,
      licenseNumber: manualLicense.trim() || null,
      dob: null,
      expirationDate: null,
      address: { street: null, city: null, state: null, postalCode: null },
      confidence: 0,
      source: "MOCK",
      raw: { manualEntry: true },
    };
    onScan(result);
  }, [manualFirstName, manualLastName, manualLicense, onScan]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text style={styles.permissionBody}>
          We need your camera to scan driver's licenses. You can also
          enter details manually.
        </Text>
        <View style={styles.permissionActions}>
          <Pressable
            onPress={() => void requestPermission()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Allow camera</Text>
          </Pressable>
          <Pressable
            onPress={() => setPhase("manual")}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Enter manually</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.tertiaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.tertiaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === "submitting") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.submittingText}>
          Reading license…
        </Text>
        <Text style={styles.submittingHint}>
          This usually takes 2-5 seconds.
        </Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>Couldn't read license</Text>
        <Text style={styles.permissionBody}>
          {error ?? "The image was too blurry or the server timed out."}
        </Text>
        <View style={styles.permissionActions}>
          <Pressable
            onPress={() => {
              setPhase("camera");
              setError(null);
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Retake</Text>
          </Pressable>
          <Pressable
            onPress={() => setPhase("manual")}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Enter manually</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.tertiaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.tertiaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === "manual") {
    return (
      <View style={styles.manualWrap}>
        <Text style={styles.manualTitle}>Enter license details</Text>
        <Text style={styles.manualSubtitle}>
          We use this to pre-fill the customer record.
        </Text>
        <TextInput
          value={manualFirstName}
          onChangeText={setManualFirstName}
          placeholder="First name"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="words"
          autoFocus
        />
        <TextInput
          value={manualLastName}
          onChangeText={setManualLastName}
          placeholder="Last name"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="words"
        />
        <TextInput
          value={manualLicense}
          onChangeText={(t) => setManualLicense(t.toUpperCase())}
          placeholder="License number"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="characters"
        />
        <View style={styles.manualActions}>
          <Pressable
            onPress={() => setPhase("camera")}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Back to camera</Text>
          </Pressable>
          <Pressable
            onPress={submitManual}
            disabled={
              manualFirstName.trim().length === 0 ||
              manualLastName.trim().length === 0
            }
            style={({ pressed }) => [
              styles.primaryButton,
              (manualFirstName.trim().length === 0 ||
                manualLastName.trim().length === 0) &&
                styles.disabled,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [
            styles.tertiaryButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.tertiaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        facing={facing}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.viewfinder} />
        <Text style={styles.viewfinderHint}>
          Align driver's license within the frame
        </Text>
      </View>
      <View style={styles.controls}>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [
            styles.controlSecondary,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.controlSecondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleCapture()}
          style={({ pressed }) => [
            styles.shutter,
            pressed && styles.shutterPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Capture driver's license"
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <Pressable
          onPress={() => setPhase("manual")}
          style={({ pressed }) => [
            styles.controlSecondary,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.controlSecondaryText}>Manual</Text>
        </Pressable>
      </View>
    </View>
  );
}

const VIEWFINDER_W = 320;
const VIEWFINDER_H = 220;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  permissionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: "center",
  },
  permissionBody: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    textAlign: "center",
    lineHeight: 22,
  },
  permissionActions: {
    width: "100%",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinder: {
    width: VIEWFINDER_W,
    height: VIEWFINDER_H,
    borderColor: colors.accent,
    borderWidth: 2,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  viewfinderHint: {
    color: colors.textPrimary,
    backgroundColor: "rgba(10,12,15,0.65)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.lg,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  controls: {
    position: "absolute",
    bottom: spacing.xl,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  controlSecondary: {
    minWidth: TOUCH_TARGET_LG,
    minHeight: TOUCH_TARGET_MD,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: "rgba(10,12,15,0.7)",
  },
  controlSecondaryText: {
    color: colors.textPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.bgPrimary,
  },
  shutterPressed: {
    transform: [{ scale: 0.95 }],
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.bgPrimary,
  },
  submittingText: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  submittingHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  manualWrap: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    padding: spacing.xl,
    gap: spacing.md,
  },
  manualTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  manualSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    marginBottom: spacing.sm,
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
  manualActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    minHeight: TOUCH_TARGET_LG,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.bgPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  secondaryButton: {
    flex: 1,
    minHeight: TOUCH_TARGET_LG,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderActive,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  tertiaryButton: {
    minHeight: TOUCH_TARGET_MD,
    alignItems: "center",
    justifyContent: "center",
  },
  tertiaryButtonText: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
});

export const dlScannerAnimDuration = duration;
