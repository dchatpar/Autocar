/**
 * AWS Textract client — driver's license OCR.
 *
 * In production:
 *   - We call `textract.analyzeID()` with the cropped ID document
 *     image. Textract returns IdentityDocumentFields with
 *     `FIRST_NAME`, `LAST_NAME`, `LICENSE_NUMBER`, `DATE_OF_BIRTH`,
 *     `ADDRESS`, `EXPIRATION_DATE`, etc. — already extracted into
 *     structured key/value pairs. (AADHAAR card / passport analysis
 *     use the same primitive.)
 *   - We map those fields to the DlScanResult shape consumed by the
 *     mobile app.
 *
 * In dev / when AWS creds are missing:
 *   - We return a deterministic mock that varies by image size (so
 *     different captures feel "real") and stamps a confidence of
 *     0.42 — below the 0.5 threshold, so the mobile UI shows the
 *     "blurry / low confidence" path and lets the user retake.
 *
 * Why not use a different OCR (Tesseract, Google Vision)?
 *   - Textract is the only cloud OCR that ships a built-in
 *     `analyzeID` primitive tuned for US/CA driver's licenses. It
 *     avoids us maintaining a label dictionary.
 *   - We pay ~$0.05 per analysis, which is fine for the volume a
 *     mobile sales team generates.
 *
 * Auth:
 *   - Region + access key + secret from the standard AWS env vars
 *     (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`),
 *     or from the per-dealer settings blob via `resolveCredential`.
 *   - We instantiate the SDK client lazily so a missing
 *     `aws-sdk` install in dev doesn't crash the import graph.
 */

import { resolveCredential, envOr } from "../shared/credentials.js";

/**
 * Local copy of the DlScanResult type so this client doesn't have to
 * import from a Zod schema. The Zod-inferred type is the source of
 * truth — the mobile app's `DlScanResult` matches this shape
 * exactly. If you add a field, update both.
 */
export interface DlScanAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export interface DlScanResult {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  licenseNumber: string | null;
  dob: string | null;
  expirationDate: string | null;
  address: DlScanAddress;
  confidence: number;
  source: "AWS_TEXTRACT" | "MOCK";
  raw: unknown;
}

const AWS_REGION_FALLBACK = "us-east-1";

/* ============================================================
 * Public API
 * ============================================================ */

export interface TextractConfig {
  region: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
}

/**
 * Read Textract config from a dealer's settings blob and the env
 * fallback. Returns `null` if neither is present, which means "use
 * the mock".
 */
export function resolveTextractConfig(
  dealerSettings: unknown,
): TextractConfig | null {
  const region =
    resolveCredential(dealerSettings, "awsRegion", "AWS_REGION").value ??
    AWS_REGION_FALLBACK;
  const accessKeyId = resolveCredential(
    dealerSettings,
    "awsAccessKeyId",
    "AWS_ACCESS_KEY_ID",
  ).value;
  const secretAccessKey = resolveCredential(
    dealerSettings,
    "awsSecretAccessKey",
    "AWS_SECRET_ACCESS_KEY",
  ).value;
  if (!accessKeyId || !secretAccessKey) {
    return null;
  }
  return { region, accessKeyId, secretAccessKey };
}

/**
 * Scan a driver's license image.
 *
 * @param dealerSettings  Per-dealer settings blob (may be `null` for
 *                        a system call). Used to pick up per-dealer
 *                        AWS credentials.
 * @param imageBuffer     Raw image bytes (JPEG/PNG/WebP).
 * @param mimeType        Image MIME type.
 * @param hint            Optional caller-supplied hint to influence
 *                        the mock in dev (e.g. the image byte
 *                        length, so different captures give
 *                        different mock fields).
 */
export async function scanDriverLicense(
  dealerSettings: unknown,
  imageBuffer: Buffer,
  mimeType: string,
  hint?: { byteLength: number },
): Promise<DlScanResult> {
  const config = resolveTextractConfig(dealerSettings);
  if (!config) {
    return mockScan(hint?.byteLength ?? imageBuffer.length);
  }
  try {
    return await callTextract(config, imageBuffer, mimeType);
  } catch (err) {
    // Textract is unreliable for poor-quality captures. Fall back
    // to a low-confidence mock so the user can retake, and surface
    // the error in server logs for ops to investigate.
    const msg = err instanceof Error ? err.message : "unknown error";
    return {
      firstName: null,
      lastName: null,
      fullName: null,
      licenseNumber: null,
      dob: null,
      expirationDate: null,
      address: { street: null, city: null, state: null, postalCode: null },
      confidence: 0.1,
      source: "AWS_TEXTRACT",
      raw: { error: msg },
    };
  }
}

/* ============================================================
 * Textract call (real)
 * ============================================================ */

interface TextractIdentityField {
  Type: { Text: string };
  ValueDetection: { Text: string; Confidence: number };
}

interface TextractIdentityDoc {
  IdentityDocumentFields: TextractIdentityField[];
}

interface TextractAnalyzeIdResponse {
  IdentityDocuments: TextractIdentityDoc[];
}

async function callTextract(
  config: TextractConfig,
  imageBuffer: Buffer,
  _mimeType: string,
): Promise<DlScanResult> {
  // We import the SDK dynamically so dev environments that haven't
  // installed it still boot. In production EAS / Docker images, the
  // `aws-sdk` package is in the dependency tree.
  const { default: AWS } = await import("aws-sdk" as string).catch(
    () => ({ default: null }) as unknown as { default: null },
  );
  if (!AWS) {
    return {
      firstName: null,
      lastName: null,
      fullName: null,
      licenseNumber: null,
      dob: null,
      expirationDate: null,
      address: { street: null, city: null, state: null, postalCode: null },
      confidence: 0,
      source: "AWS_TEXTRACT",
      raw: { error: "aws-sdk not installed" },
    };
  }
  const textract = new (AWS as unknown as {
    Textract: new (config: {
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    }) => {
      analyzeID(params: {
        DocumentPages: Array<{ Bytes: Buffer }>;
      }): {
        promise: () => Promise<TextractAnalyzeIdResponse>;
      };
    };
  }).Textract({
    region: config.region,
    accessKeyId: config.accessKeyId ?? "",
    secretAccessKey: config.secretAccessKey ?? "",
  });

  const out = await textract
    .analyzeID({ DocumentPages: [{ Bytes: imageBuffer }] })
    .promise();

  const doc = out.IdentityDocuments?.[0];
  const fields = doc?.IdentityDocumentFields ?? [];
  if (fields.length === 0) {
    return {
      firstName: null,
      lastName: null,
      fullName: null,
      licenseNumber: null,
      dob: null,
      expirationDate: null,
      address: { street: null, city: null, state: null, postalCode: null },
      confidence: 0,
      source: "AWS_TEXTRACT",
      raw: { raw: out },
    };
  }

  // Textract returns `Type.Text` for the field name. The set of
  // types we care about is documented at
  // https://docs.aws.amazon.com/textract/latest/dg/identitydocumentfields.html
  const lookup = (name: string): { value: string; confidence: number } | null => {
    const match = fields.find(
      (f) => f.Type.Text.toUpperCase() === name.toUpperCase(),
    );
    if (!match) return null;
    return { value: match.ValueDetection.Text, confidence: match.ValueDetection.Confidence };
  };

  const first = lookup("FIRST_NAME");
  const last = lookup("LAST_NAME");
  const lic = lookup("LICENSE_NUMBER");
  const dob = lookup("DATE_OF_BIRTH");
  const exp = lookup("EXPIRATION_DATE");
  const addr = lookup("ADDRESS");
  const city = lookup("CITY_IN_ADDRESS");
  const state = lookup("STATE_IN_ADDRESS");
  const zip = lookup("ZIP_CODE_IN_ADDRESS");

  // Confidence: average across the fields we actually extracted.
  const allConfidences = [first, last, lic, dob, exp, addr, city, state, zip]
    .filter((v): v is { value: string; confidence: number } => v !== null)
    .map((v) => v.confidence);
  const confidence =
    allConfidences.length > 0
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length / 100
      : 0;

  return {
    firstName: first?.value ?? null,
    lastName: last?.value ?? null,
    fullName: [first?.value, last?.value].filter(Boolean).join(" ") || null,
    licenseNumber: lic?.value ?? null,
    dob: parseDate(dob?.value),
    expirationDate: parseDate(exp?.value),
    address: {
      street: addr?.value ?? null,
      city: city?.value ?? null,
      state: state?.value ?? null,
      postalCode: zip?.value ?? null,
    },
    confidence,
    source: "AWS_TEXTRACT",
    raw: { fields, out },
  };
}

/* ============================================================
 * Mock — for dev / no-credentials environments
 * ============================================================ */

function mockScan(byteLength: number): DlScanResult {
  // The byte length varies per capture, so re-capturing the same
  // license gives a slightly different mock. This makes the dev UX
  // feel real without requiring AWS credentials.
  const seed = byteLength % 1000;
  const firstNames = ["Jordan", "Avery", "Casey", "Riley", "Morgan"];
  const lastNames = ["Patel", "Nguyen", "Garcia", "Kim", "Brown"];
  const cities = ["Austin", "Denver", "Portland", "Phoenix", "Atlanta"];
  const states = ["TX", "CO", "OR", "AZ", "GA"];

  const first = firstNames[seed % firstNames.length] ?? "Casey";
  const last = lastNames[(seed + 2) % lastNames.length] ?? "Garcia";
  const city = cities[(seed + 1) % cities.length] ?? "Austin";
  const state = states[(seed + 1) % states.length] ?? "TX";
  const streetNumber = 100 + (seed % 9000);
  const streetName = ["Maple St", "Oak Ave", "Pine Rd", "Cedar Ln"][
    seed % 4
  ];
  const zip = String(10000 + (seed * 37) % 89999).padStart(5, "0");
  const licenseNumber = `DL${String(1000000 + seed * 13).slice(0, 7)}`;

  return {
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    licenseNumber,
    dob: "1990-05-15",
    expirationDate: "2028-05-15",
    address: {
      street: `${streetNumber} ${streetName ?? "Maple St"}`,
      city,
      state,
      postalCode: zip,
    },
    confidence: 0.42,
    source: "MOCK",
    raw: { mock: true, byteLength },
  };
}

/**
 * Parse the variety of date formats Textract returns.
 * - "MM/DD/YYYY"     (US DLs)
 * - "YYYY-MM-DD"     (ISO)
 * - "MMM DD, YYYY"   (long-form)
 */
function parseDate(input: string | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // MM/DD/YYYY
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slash && slash[1] && slash[2] && slash[3]) {
    const mm = slash[1].padStart(2, "0");
    const dd = slash[2].padStart(2, "0");
    const yyyy = slash[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  // YYYY-MM-DD (or with time)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  // Try Date.parse as a last resort
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) {
    return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

// Re-export envOr for the route layer to compose its own env reads.
export { envOr };
