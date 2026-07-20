import redact from "@pinojs/redact";
import { redactum } from "redactum";
import type { RedactionOptions, RedactionRule, RedactedPreview } from "./types";

const DEFAULT_MAX_PREVIEW_CHARS = 512;

const BUILT_IN_RULES: RedactionRule[] = [
  { name: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { name: "phone", pattern: /(?:\+?\d[\s().-]?){10,16}/g },
  { name: "payment_card", pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  { name: "api_key", pattern: /\b(?:sk|pk|rk|api|key|token)[-_][A-Za-z0-9_\-]{12,}\b/gi },
  { name: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi },
  {
    name: "generic_token",
    pattern: /\b[A-Za-z0-9_\-]{20,}\b/g,
    replacement: "[REDACTED:token]",
  },
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
  redactionBreakdown?: Record<string, number>;
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

export function redactText(text: string, options: RedactionOptions = {}): RedactionResult {
  const result = redactum(text, {
    replacement: (match, category) => `[REDACTED:${category.toLowerCase()}]`,
  });

  const redactionBreakdown: Record<string, number> = {};
  for (const finding of result.findings) {
    const cat = finding.category.toLowerCase();
    redactionBreakdown[cat] = (redactionBreakdown[cat] ?? 0) + 1;
  }

  let redacted = result.redactedText;
  let redactionCount = result.findings.length;

  const allRegexRules = [...BUILT_IN_RULES, ...(options.customRules ?? [])];
  for (const rule of allRegexRules) {
    let ruleCount = 0;
    redacted = redacted.replace(rule.pattern, () => {
      redactionCount += 1;
      ruleCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
    if (ruleCount > 0) {
      const key = options.customRules?.includes(rule) ? `custom:${rule.name}` : `builtin:${rule.name}`;
      redactionBreakdown[key] = ruleCount;
    }
  }

  return { value: redacted, redactionCount, redactionBreakdown, truncated: false };
}

export function redactValue(value: unknown, options: RedactionOptions = {}): RedactionResult {
  const sensitiveKeys = new Set([...(options.sensitiveKeys ?? []), ...DEFAULT_SENSITIVE_KEYS]);
  const { value: redacted, redactionCount: keyRedactionCount } = redactKeys(value, sensitiveKeys);
  let text = stringifyPreview(redacted);
  let redactionCount = keyRedactionCount;

  const redactionBreakdown: Record<string, number> = {};
  if (keyRedactionCount > 0) {
    redactionBreakdown["redacted_key"] = keyRedactionCount;
  }

  const result = redactum(text, {
    replacement: (match, category) => `[REDACTED:${category.toLowerCase()}]`,
  });
  text = result.redactedText;
  for (const finding of result.findings) {
    const cat = finding.category.toLowerCase();
    redactionBreakdown[cat] = (redactionBreakdown[cat] ?? 0) + 1;
  }
  redactionCount += result.findings.length;

  for (const rule of BUILT_IN_RULES) {
    let ruleCount = 0;
    text = text.replace(rule.pattern, () => {
      redactionCount += 1;
      ruleCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
    if (ruleCount > 0) {
      redactionBreakdown[`builtin:${rule.name}`] = ruleCount;
    }
  }

  for (const rule of options.customRules ?? []) {
    let ruleCount = 0;
    text = text.replace(rule.pattern, () => {
      redactionCount += 1;
      ruleCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
    if (ruleCount > 0) {
      redactionBreakdown[`custom:${rule.name}`] = ruleCount;
    }
  }

  return { value: text, redactionCount, redactionBreakdown, truncated: false };
}

export function redactPreview(value: unknown, options: RedactionOptions = {}): RedactionResult {
  if (options.allowRaw) {
    const truncated = truncatePreview(stringifyPreview(value), options.maxPreviewChars);
    return { ...truncated, redactionBreakdown: undefined };
  }

  const redactionBreakdown: Record<string, number> = {};

  const sensitiveKeys = new Set([...(options.sensitiveKeys ?? []), ...DEFAULT_SENSITIVE_KEYS]);
  const { value: normalized, redactionCount: keyRedactionCount } = redactKeys(value, sensitiveKeys);
  if (keyRedactionCount > 0) {
    redactionBreakdown["redacted_key"] = keyRedactionCount;
  }

  let text = stringifyPreview(normalized);
  let redactionCount = keyRedactionCount;

  const result = redactum(text, {
    replacement: (match, category) => `[REDACTED:${category.toLowerCase()}]`,
  });
  text = result.redactedText;
  for (const finding of result.findings) {
    const cat = finding.category.toLowerCase();
    redactionBreakdown[cat] = (redactionBreakdown[cat] ?? 0) + 1;
  }
  redactionCount += result.findings.length;

  for (const rule of BUILT_IN_RULES) {
    let ruleCount = 0;
    text = text.replace(rule.pattern, () => {
      redactionCount += 1;
      ruleCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
    if (ruleCount > 0) {
      redactionBreakdown[`builtin:${rule.name}`] = ruleCount;
    }
  }

  for (const rule of options.customRules ?? []) {
    let ruleCount = 0;
    text = text.replace(rule.pattern, () => {
      redactionCount += 1;
      ruleCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
    if (ruleCount > 0) {
      redactionBreakdown[`custom:${rule.name}`] = ruleCount;
    }
  }

  const truncated = truncatePreview(text, options.maxPreviewChars);
  return {
    value: truncated.value,
    redactionCount: redactionCount + truncated.redactionCount,
    redactionBreakdown,
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

  const hasInput = input !== undefined && input !== null;
  const hasOutput = output !== undefined && output !== null;

  const inputPreview = hasInput ? redactPreview(input, options) : undefined;
  const outputPreview = hasOutput ? redactPreview(output, options) : undefined;

  const redactionBreakdown: Record<string, number> = {};
  for (const p of [inputPreview, outputPreview]) {
    if (p?.redactionBreakdown) {
      for (const [cat, count] of Object.entries(p.redactionBreakdown)) {
        redactionBreakdown[cat] = (redactionBreakdown[cat] ?? 0) + count;
      }
    }
  }

  return {
    input: inputPreview?.value,
    output: outputPreview?.value,
    disabled: false,
    redactionCount: (inputPreview?.redactionCount ?? 0) + (outputPreview?.redactionCount ?? 0),
    redactionBreakdown: Object.keys(redactionBreakdown).length > 0 ? redactionBreakdown : undefined,
    truncated: (inputPreview?.truncated ?? false) || (outputPreview?.truncated ?? false),
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

export function redactObjectStrings(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  if (typeof value === "string") {
    return redactText(value, options).value;
  }

  if (Array.isArray(value)) {
    const results: unknown[] = [];
    for (const item of value) {
      results.push(redactObjectStrings(item, options));
    }
    return results;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = redactObjectStrings(val, options);
    }
    return result;
  }

  return value;
}

async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function redactStringsDeep(
  value: unknown,
  options: RedactionOptions = {},
): Promise<unknown> {
  if (typeof value === "string") {
    const result = await redactTextAsync(value, options);
    return result.value;
  }

  if (Array.isArray(value)) {
    const results: unknown[] = [];
    for (const item of value) {
      results.push(await redactStringsDeep(item, options));
    }
    return results;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = await redactStringsDeep(val, options);
      await yieldToEventLoop();
    }
    return result;
  }

  return value;
}

export async function redactTextAsync(
  text: string,
  options: RedactionOptions = {},
): Promise<RedactionResult> {
  const result = redactum(text, {
    replacement: (match, category) => `[REDACTED:${category.toLowerCase()}]`,
  });
  await yieldToEventLoop();

  const redactionBreakdown: Record<string, number> = {};
  for (const finding of result.findings) {
    const cat = finding.category.toLowerCase();
    redactionBreakdown[cat] = (redactionBreakdown[cat] ?? 0) + 1;
  }

  let redacted = result.redactedText;
  let redactionCount = result.findings.length;

  for (const rule of BUILT_IN_RULES) {
    let ruleCount = 0;
    redacted = redacted.replace(rule.pattern, () => {
      redactionCount += 1;
      ruleCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
    if (ruleCount > 0) {
      redactionBreakdown[`builtin:${rule.name}`] = ruleCount;
    }
    await yieldToEventLoop();
  }

  for (const rule of options.customRules ?? []) {
    let ruleCount = 0;
    redacted = redacted.replace(rule.pattern, () => {
      redactionCount += 1;
      ruleCount += 1;
      return rule.replacement ?? `[REDACTED:${rule.name}]`;
    });
    if (ruleCount > 0) {
      redactionBreakdown[`custom:${rule.name}`] = ruleCount;
    }
    await yieldToEventLoop();
  }

  return { value: redacted, redactionCount, redactionBreakdown, truncated: false };
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
