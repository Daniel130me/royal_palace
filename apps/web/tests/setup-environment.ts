import { vi } from "vitest";

// Tests must never depend on a developer's local .env file. These values are
// synthetic and initialize the same fail-closed configuration path used at runtime.
vi.stubEnv("API_BASE_URL", "http://127.0.0.1:4000");
vi.stubEnv("APP_ENV", "test");
vi.stubEnv("APP_VERSION", "test-version");
vi.stubEnv("BFF_ACTIVE_COOKIE_KEY_ID", "test-key-1");
vi.stubEnv(
  "BFF_COOKIE_ENCRYPTION_KEYS",
  JSON.stringify({ "test-key-1": Buffer.alloc(32, 1).toString("base64") }),
);
vi.stubEnv("BFF_INTERNAL_SECRET", Buffer.alloc(32, 2).toString("base64"));
vi.stubEnv("BFF_API_TIMEOUT_MS", "5000");
vi.stubEnv("LOG_LEVEL", "silent");
vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
