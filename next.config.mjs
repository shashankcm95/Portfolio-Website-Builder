/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
    // Phase R1 — enables `src/instrumentation.ts` to run on server boot
    // so we fail fast when ENCRYPTION_KEY is missing rather than at the
    // first request that needs a secret.
    instrumentationHook: true,
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    // Silence the pg-native module-not-found warning. `pg` ships an
    // optional native client wrapper (lib/native/*) that does
    // `require("pg-native")` so it can offer libpq-backed pooling when
    // the user installs `pg-native` separately. We use the pure-JS
    // client (`new Pool(...)`), so pg-native is never loaded at
    // runtime — but webpack's static analyzer still walks the require
    // and warns it can't resolve the module. Aliasing it to `false`
    // makes webpack treat it as an empty module, eliminating the
    // warning without changing runtime behavior.
    config.resolve.alias["pg-native"] = false;
    return config;
  },
};

export default nextConfig;
