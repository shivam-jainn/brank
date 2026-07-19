import redact from "@pinojs/redact";

const redactFn = redact({
  paths: ["authorization", "apiKey"],
  censor: "[REDACTED:key]",
  serialize: true,  // default
});

const input = {
  authorization: "Bearer abcdefghijklmnop",
  apiKey: "sk_abcdefghijklmnopqrstuvwxyz",
  normal: "value"
};

console.log("Input:", JSON.stringify(input));

const redacted = redactFn(input);
console.log("Redacted:", redacted);

console.log("RedactFn type:", typeof redactFn);
console.log("RedactFn keys:", Object.keys(redactFn));

// Try to access restore
const restoreFn = (redactFn as any).restore;
if (restoreFn) {
  console.log("Restore function exists");
  const restored = restoreFn(redacted);
  console.log("Restored:", restored);
} else {
  console.log("No restore function");
}
