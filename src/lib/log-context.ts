/**
 * Phase R5b — Request-scoped context for the logger.
 *
 * Uses Node's `AsyncLocalStorage` so any code executing inside
 * `runWithRequestId(id, fn)` can look up the current request id
 * without having to thread it through every function parameter.
 *
 * **Edge-runtime caveat.** `AsyncLocalStorage` is a Node-only API.
 * Next.js middleware runs on the Edge runtime, where this module
 * will be absent. Middleware therefore limits itself to setting an
 * `x-request-id` header on the response; Node-runtime API routes
 * can either read that header off the incoming request or wrap
 * their handler in `runWithRequestId` themselves. The logger will
 * gracefully return `undefined` for the request id when ALS isn't
 * active, so nothing breaks — downstream logs just won't be tagged.
 */

// Import lazily via a guarded require so Edge bundles that statically
// analyze this file don't fail — `async_hooks` isn't available there.
// In practice this module is only imported from Node-runtime files,
// but belt-and-braces.
type Store = { reqId: string };

// Use an indirect `eval` to hide `require("async_hooks")` from
// Edge-runtime static analysis. In Node this resolves normally; in
// Edge the require is simply unavailable and we fall back to a no-op.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let als: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any =
    typeof require !== "undefined"
      ? require
      : // eslint-disable-next-line no-eval
        (0, eval)("typeof require === 'function' ? require : null");
  if (req) {
    // Cast via `as unknown as` to thread generics through the `any`-typed
    // dynamic require. `import("async_hooks")` would give better types
    // but is asynchronous; keeping this sync matches the rest of the
    // module's shape.
    const mod = req("async_hooks") as {
      AsyncLocalStorage: new <T>() => {
        run: <R>(store: T, cb: () => R) => R;
        getStore: () => T | undefined;
      };
    };
    als = new mod.AsyncLocalStorage<Store>();
  }
} catch {
  // Edge / non-Node — ALS isn't available. `currentRequestId` will
  // always return undefined in this environment.
  als = null;
}

export function runWithRequestId<T>(reqId: string, fn: () => T): T {
  if (!als) return fn();
  return als.run({ reqId }, fn);
}

export function currentRequestId(): string | undefined {
  if (!als) return undefined;
  const store = als.getStore() as Store | undefined;
  return store?.reqId;
}
