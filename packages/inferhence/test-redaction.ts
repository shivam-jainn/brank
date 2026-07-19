import { redactPreview } from "./src/redaction";

const result = redactPreview({
  email: "ada@example.com",
  phone: "+1 (415) 555-2671",
  card: "4242 4242 4242 4242",
  authorization: "Bearer abcdefghijklmnop",
  apiKey: "sk_abcdefghijklmnopqrstuvwxyz",
  tenant: "tenant-123",
  long: "x".repeat(40),
}, {
  maxPreviewChars: 180,
  customRules: [{ name: "tenant", pattern: /tenant-\d+/g }],
});

console.log("Value:", result.value);
console.log("Redaction count:", result.redactionCount);
console.log("Truncated:", result.truncated);
