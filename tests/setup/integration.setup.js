// Integration tests run in a Node environment. We mock the db module in each
// suite (via jest.mock) — this file seeds the environment with safe defaults
// so modules that read env at import time don't crash.

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret";
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "test-client";
process.env.GITHUB_CLIENT_SECRET =
  process.env.GITHUB_CLIENT_SECRET || "test-secret";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key";
// 32 null bytes base64-encoded — deterministic test key for AES-256-GCM.
// master-key.ts fail-fast on boot requires this to be a valid 32-byte base64.
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
