require("@testing-library/jest-dom");
const { TextDecoder, TextEncoder } = require("util");

// Crypto tests import master-key.ts which fails fast when ENCRYPTION_KEY is
// missing. Provide a deterministic 32-byte base64 key for the test env.
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Silence "Not implemented: navigation" noise from jsdom for link clicks
const originalError = console.error;
console.error = (...args) => {
  const first = args[0];
  if (
    typeof first === "string" &&
    first.includes("Not implemented: navigation")
  ) {
    return;
  }
  originalError(...args);
};
