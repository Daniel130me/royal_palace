import { describe, expect, it } from "vitest";

import { KeyRingSecretBox, SecretBox, SecretBoxError } from "../src/secret-box.js";

const key = Buffer.alloc(32, 9).toString("base64");

describe("SecretBox", () => {
  it("round-trips a value only in its intended context", () => {
    const box = new SecretBox(key, "test-key");
    const sealed = box.seal("session-id", "session-cookie");

    expect(box.open(sealed, "session-cookie")).toBe("session-id");
    expect(() => box.open(sealed, "login-cookie")).toThrow(SecretBoxError);
  });

  it("rejects modified ciphertext", () => {
    const box = new SecretBox(key, "test-key");
    const sealed = box.seal("session-id", "session-cookie");
    const replacement = sealed.endsWith("A") ? "B" : "A";

    expect(() => box.open(`${sealed.slice(0, -1)}${replacement}`, "session-cookie")).toThrow(
      SecretBoxError,
    );
  });

  it("keeps old values readable during key rotation", () => {
    const previous = new KeyRingSecretBox({ previous: key }, "previous");
    const sealed = previous.seal("session-id", "session-cookie");
    const rotating = new KeyRingSecretBox(
      { current: Buffer.alloc(32, 8).toString("base64"), previous: key },
      "current",
    );

    expect(rotating.open(sealed, "session-cookie")).toBe("session-id");
    expect(rotating.seal("new-session", "session-cookie")).toContain("v1.current.");
  });
});
