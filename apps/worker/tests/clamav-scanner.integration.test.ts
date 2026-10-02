import { describe, expect, it } from "vitest";

import { scanWithClamAv } from "../src/document-scan/clamav-scanner.js";

describe.skipIf(process.env.RUN_CLAMAV_INTEGRATION !== "true")("local ClamAV contract", () => {
  const scanner = {
    host: process.env.CLAMAV_HOST ?? "127.0.0.1",
    port: Number(process.env.CLAMAV_PORT ?? "3310"),
    timeoutMs: 30_000,
  };

  it("accepts synthetic clean content", async () => {
    await expect(scanWithClamAv(Buffer.from("synthetic evidence"), scanner)).resolves.toBe("CLEAN");
  });

  it("detects the harmless EICAR test signature", async () => {
    const eicar = String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;
    await expect(scanWithClamAv(Buffer.from(eicar), scanner)).resolves.toBe("INFECTED");
  });
});
