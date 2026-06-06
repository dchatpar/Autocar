/**
 * Phone number utilities.
 *
 * - `toE164`: normalize a free-form phone string to E.164 format
 *   (e.g. "+14165551234"). Best-effort — North American 10-digit
 *   numbers default to +1, others pass through. Strips everything
 *   except digits and the leading +.
 * - `isValidE164`: shape check on the E.164 format.
 *
 * We do not require libphonenumber-js because the spec says "normalize
 * to E.164" and we want zero new heavy deps. For production-grade
 * validation across 200+ regions, swap in `libphonenumber-js` later —
 * the public surface (`toE164`, `isValidE164`) is stable.
 */

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalize a phone string into E.164 format.
 *
 * Rules:
 *   1. Trim, drop everything except leading `+` and digits.
 *   2. If no `+` and length === 10 (NANP), prepend "+1".
 *   3. If no `+` and length === 11 starting with "1", prepend "+".
 *   4. If no `+` and length >= 11, prepend "+" as-is.
 *   5. If has `+`, leave digits alone.
 *
 * Returns the normalized string, or `null` if the input is empty or
 * could not be normalized to a plausible E.164 number.
 */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");

  if (digits.length === 0) return null;

  let candidate: string;
  if (hasPlus) {
    candidate = `+${digits}`;
  } else if (digits.length === 10) {
    // Assume NANP (US/Canada) — most common in dealer CRM.
    candidate = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    candidate = `+${digits}`;
  } else if (digits.length >= 11 && digits.length <= 15) {
    candidate = `+${digits}`;
  } else {
    return null;
  }

  return isValidE164(candidate) ? candidate : null;
}

/**
 * Validate that a string matches the E.164 format.
 *
 * Format: a leading `+` followed by 7 to 15 digits, with the first
 * digit being 1–9 (no leading zeros for country code).
 */
export function isValidE164(value: string | null | undefined): boolean {
  if (!value) return false;
  return E164_REGEX.test(value);
}

/**
 * Mask a phone number for display: keep country code + last 4 digits.
 *
 * "+14165551234" → "+1••• ••••1234"
 */
export function maskPhone(value: string | null | undefined): string {
  const e = toE164(value);
  if (!e) return "—";
  if (e.length <= 5) return e;
  const cc = e.startsWith("+1") && e.length === 12 ? "+1" : e.slice(0, e.length - 10);
  const last4 = e.slice(-4);
  return `${cc} ••• ••• ${last4}`;
}
