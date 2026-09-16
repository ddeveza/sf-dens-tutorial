// Vitest alias target for the `server-only` package: the real module throws when imported
// outside a React Server Components bundle. Tests import engine modules directly, so this is a no-op.
export {};
