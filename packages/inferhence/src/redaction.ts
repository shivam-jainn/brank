import redact from "@pinojs/redact";
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

interface RedactedResult extends Record<string, unknown> {
  restore?: () => unknown;
}

function buildRedactPaths(sensitiveKeys: Set<string>): string[] {
  const paths: string[] = [];
  for (const key of sensitiveKeys) {
    paths.push(
      key,
      `*.${key}`,
      `*[*].${key}`,
      `*.*.${key}`,
      `*.[*].${key}`,
      `*.*.*.${key}`,
      `*.*.[*].${key}`,
      `*.*.*.*.${key}`,
      `*.*.*.[*].${key}`
    );
  }
  return paths;
}

function createRedactor(sensitiveKeys: Set<string>) {
  return redact({
    paths: buildRedactPaths(sensitiveKeys),
    censor: "[REDACTED:key]",
    serialize: false,
  });
}

function redactKeys(value: unknown, sensitiveKeys: Set<string>): { value: unknown; redactionCount: number } {
  if (!value || typeof value !== "object") {
    return { value, redactionCount: 0 };
  }

  let cloned: unknown;
  try {
    cloned = JSON.parse(JSON.stringify(value));
  } catch {
    cloned = value;
  }

  const redactFn = createRedactor(sensitiveKeys);
  const redacted = redactFn(cloned) as RedactedResult;

  let redactionCount = 0;
  const restoreFn = redacted.restore;
  if (restoreFn) {
    const original = restoreFn();
    redactionCount = countRedactedKeys(original, redacted);
  }

  return { value: redacted, redactionCount };
}

function countRedactedKeys(original: unknown, redacted: unknown): number {
  if (!original || typeof original !== "object" || !redacted || typeof redacted !== "object") {
    return 0;
  }

  if (Array.isArray(original) && Array.isArray(redacted)) {
    return original.reduce((count, item, index) => count + countRedactedKeys(item, redacted[index]), 0);
  }

  if (Array.isArray(original) || Array.isArray(redacted)) {
    return 0;
  }

  const originalObj = original as Record<string, unknown>;
  const redactedObj = redacted as Record<string, unknown>;

  let count = 0;
  for (const key of Object.keys(redactedObj)) {
    const originalValue = originalObj[key];
    const redactedValue = redactedObj[key];

    if (redactedValue === "[REDACTED:key]") {
      count += 1;
    } else if (originalValue && typeof originalValue === "object" && redactedValue && typeof redactedValue === "object") {
      count += countRedactedKeys(originalValue, redactedValue);
    }
  }

  return count;
}

export function redactPreview(value: unknown, options: RedactionOptions = {}): RedactionResult {
  if (options.allowRaw) {
    return truncatePreview(stringifyPreview(value), options.maxPreviewChars);
  }

  const sensitiveKeys = new Set([...(options.sensitiveKeys ?? []), ...DEFAULT_SENSITIVE_KEYS]);
  const { value: normalized, redactionCount: keyRedactionCount } = redactKeys(value, sensitiveKeys);
  let text = stringifyPreview(normalized);
  let redactionCount = keyRedactionCount;

  for (const rule of [...BUILT_IN_RULES, ...(options.customRules ?? [])]) {
    text = text.replace(rule.pattern, () => {
      redactionCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
  }

  const truncated = truncatePreview(text, options.maxPreviewChars);
  return {
    value: truncated.value,
    redactionCount: redactionCount + truncated.redactionCount,
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
