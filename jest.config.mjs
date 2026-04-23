import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  testMatch: [
    "<rootDir>/src/**/*.test.ts",
    "<rootDir>/src/**/*.test.tsx",
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/unit/**/*.test.tsx",
    "<rootDir>/tests/integration/**/*.test.ts",
  ],
  setupFilesAfterEnv: [
    "<rootDir>/tests/setup/unit.setup.js",
    "<rootDir>/tests/setup/integration.setup.js",
  ],
  moduleNameMapper: {
    // Phase R5 — the `@/templates/*` rule MUST come first. nextJest
    // applies moduleNameMapper entries in declaration order and the
    // broader `@/(.*)` catch-all would otherwise swallow any
    // `@/templates/…` import and resolve it to the non-existent
    // `src/templates/…` path. Ordering these specific-first fixes the
    // issue the decoupling test + earlier analytics-offline test had
    // to work around by using relative imports.
    "^@/templates/(.*)$": "<rootDir>/templates/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
  ],
};

export default createJestConfig(config);
