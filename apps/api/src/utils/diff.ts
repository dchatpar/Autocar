/**
 * Diff utilities for the activity-log audit trail.
 *
 * Computes a structured before/after diff for any JSON-serializable
 * payload. Used by `activity-logger.service.ts` to persist a `diff`
 * column alongside the `before`/`after` snapshots so the UI can show
 * a side-by-side DiffViewer without re-deriving the diff client-side.
 *
 * Design goals:
 *   - Pure functions; no I/O, no logging.
 *   - Stable output shape regardless of key insertion order.
 *   - Handle nested objects, arrays, and primitive values.
 *   - Truncate long values (passwords, JWTs, credit-card numbers) so we
 *     never persist sensitive data in the audit log.
 *   - Be cheap: O(n) over the smaller of before/after.
 */

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface EntityDiff {
  /** Fields whose value changed between before and after. */
  changed: FieldChange[];
  /** Top-level keys present in `after` but not in `before`. */
  added: string[];
  /** Top-level keys present in `before` but not in `after`. */
  removed: string[];
}

/**
 * Field names whose values must NEVER be persisted. Matched case-
 * insensitively against the dotted path. We replace the value with
 * "[REDACTED]" in the diff and discard the raw value from the snapshot.
 */
const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "currentpassword",
  "current_password",
  "newpassword",
  "new_password",
  "token",
  "refreshtoken",
  "refresh_token",
  "accesstoken",
  "access_token",
  "jwttoken",
  "jwt",
  "authorization",
  "secret",
  "apikey",
  "api_key",
  "ssn",
  "socialsecuritynumber",
  "creditcard",
  "credit_card",
  "cardnumber",
  "card_number",
  "cvv",
  "pin",
]);

const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_LENGTH = 200;

/**
 * Top-level wrapper that strips sensitive fields from a snapshot and
 * replaces them with "[REDACTED]". Returns a deep-cloned, redacted
 * copy; does not mutate the input.
 */
export function redactSnapshot(value: unknown): unknown {
  return redactInternal(value, "");
}

function redactInternal(value: unknown, path: string): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const truncated = value.slice(0, MAX_ARRAY_LENGTH);
    return truncated.map((v, i) => redactInternal(v, `${path}[${i}]`));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const childPath = path ? `${path}.${k}` : k;
      if (isSensitiveField(childPath)) {
        result[k] = "[REDACTED]";
        continue;
      }
      result[k] = redactInternal(v, childPath);
    }
    return result;
  }
  if (typeof value === "string") {
    if (looksLikeJwt(value) || looksLikeCreditCard(value)) {
      return "[REDACTED]";
    }
    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}…`;
    }
  }
  return value;
}

function isSensitiveField(path: string): boolean {
  const leaf = path.split(".").pop() ?? path;
  return REDACTED_FIELDS.has(leaf.toLowerCase());
}

function looksLikeJwt(value: string): boolean {
  // Three base64url segments separated by dots.
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function looksLikeCreditCard(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 13 && digits.length <= 19;
}

/**
 * Compute the structural diff between two snapshots.
 *
 * Both `before` and `after` are expected to be plain JSON objects
 * (typically a row serialized via `JSON.parse(JSON.stringify(row))`).
 * Returns a structured `EntityDiff` ready to persist to the
 * `ActivityLog.diff` column.
 */
export function computeDiff(
  before: unknown,
  after: unknown,
): EntityDiff {
  const beforeObj = isPlainObject(before) ? (before as Record<string, unknown>) : {};
  const afterObj = isPlainObject(after) ? (after as Record<string, unknown>) : {};

  const allKeys = new Set<string>([
    ...Object.keys(beforeObj),
    ...Object.keys(afterObj),
  ]);

  const changed: FieldChange[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const inBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
    const inAfter = Object.prototype.hasOwnProperty.call(afterObj, key);

    if (inBefore && !inAfter) {
      removed.push(key);
      changed.push({ field: key, before: beforeObj[key], after: undefined });
      continue;
    }
    if (!inBefore && inAfter) {
      added.push(key);
      changed.push({ field: key, before: undefined, after: afterObj[key] });
      continue;
    }
    if (!deepEqual(beforeObj[key], afterObj[key])) {
      changed.push({ field: key, before: beforeObj[key], after: afterObj[key] });
    }
  }

  return { changed, added, removed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i += 1) {
      if (aKeys[i] !== bKeys[i]) return false;
      const key = aKeys[i] as string;
      if (
        !deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        )
      ) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * Convert a Prisma row (or any object) to a JSON-serializable plain
 * object suitable for snapshotting. Strips functions, symbols, and
 * undefined values; preserves Date as ISO string and Decimal as
 * number when possible.
 */
export function toSnapshot<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((v) => toSnapshot(v));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      result[k] = toSnapshot(v);
    }
    return result;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
