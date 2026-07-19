import type { RedactionOptions, RedactionRule, RedactedPreview } from "./types";

const DEFAULT_MAX_PREVIEW_CHARS = 512;

const BUILT_IN_RULES: RedactionRule[] = [
  { name: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { name: "phone", pattern: /(?:\+?\d[\s().-]?){10,16}/g },
  { name: "payment_card", pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  { name: "api_key", pattern: /\b(?:sk|pk|rk|api|key|token)_[A-Za-z0-9_\-]{16,}\b/g },
  { name: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi },
];

const DEFAULT_SENSITIVE_KEYS = [
  "authorization",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "password",
  "secret",
  "clientSecret",
  "client_secret",
  "token",
  "cookie",
  "set-cookie",
];

export type RedactionResult = {
  value: string;
  redactionCount: number;
  truncated: boolean;
};

export function redactPreview(value: unknown, options: RedactionOptions = {}): RedactionResult {
  if (options.allowRaw) {
    return truncatePreview(stringifyPreview(value), options.maxPreviewChars);
  }

  const sensitiveKeys = new Set([...(options.sensitiveKeys ?? []), ...DEFAULT_SENSITIVE_KEYS]);
  const normalized = maskSensitiveObjectKeys(value, sensitiveKeys);
  let text = stringifyPreview(normalized);
  let redactionCount = 0;

  for (const rule of [...BUILT_IN_RULES, ...(options.customRules ?? [])]) {
    text = text.replace(rule.pattern, () => {
      redactionCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
  }

  const truncated = truncatePreview(text, options.maxPreviewChars);
  return {
    value: truncated.value,
    redactionCount: redactionCount + countMaskedKeys(normalized),
    truncated: truncated.truncated,
  };
}

export function buildPreviews(
  input: unknown,
  output: unknown,
  options: RedactionOptions = {},
): RedactedPreview {
  if (options.previewEnabled === false) {
    return { disabled: true, redactionCount: 0, truncated: false };
  }

  const inputPreview = redactPreview(input, options);
  const outputPreview = redactPreview(output, options);

  return {
    input: inputPreview.value,
    output: outputPreview.value,
    disabled: false,
    redactionCount: inputPreview.redactionCount + outputPreview.redactionCount,
    truncated: inputPreview.truncated || outputPreview.truncated,
  };
}

function truncatePreview(value: string, maxPreviewChars = DEFAULT_MAX_PREVIEW_CHARS): RedactionResult {
  if (value.length <= maxPreviewChars) {
    return { value, redactionCount: 0, truncated: false };
  }

  return {
    value: `${value.slice(0, Math.max(0, maxPreviewChars))}[TRUNCATED]`,
    redactionCount: 0,
    truncated: true,
  };
}

function stringifyPreview(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function maskSensitiveObjectKeys(value: unknown, sensitiveKeys: Set<string>): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveObjectKeys(item, sensitiveKeys));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (sensitiveKeys.has(key) || sensitiveKeys.has(key.toLowerCase())) {
        return [key, "[REDACTED:key]"];
      }

      return [key, maskSensitiveObjectKeys(nested, sensitiveKeys)];
    }),
  );
}

function countMaskedKeys(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }

  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countMaskedKeys(item), 0);
  }

  return Object.values(value as Record<string, unknown>).reduce<number>(
    (count, item) => count + (item === "[REDACTED:key]" ? 1 : countMaskedKeys(item)),
    0,
  );
}
