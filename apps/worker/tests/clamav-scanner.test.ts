import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { scanWithClamAv } from "../src/document-scan/clamav-scanner.js";

const servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function startScanner(response: string): Promise<number> {
  const server = net.createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const input = Buffer.concat(chunks);
      if (input.subarray(0, 10).toString() !== "zINSTREAM\0") return;
      let offset = 10;
      while (offset + 4 <= input.length) {
        const length = input.readUInt32BE(offset);
        offset += 4;
        if (length === 0) {
          socket.end(response);
          return;
        }
        if (offset + length > input.length) return;
        offset += length;
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing scanner port");
  return address.port;
}

describe("ClamAV streaming client", () => {
  it("accepts a clean scan response", async () => {
    const port = await startScanner("stream: OK\0");
    await expect(
      scanWithClamAv(Buffer.from("synthetic document"), {
        host: "127.0.0.1",
        port,
        timeoutMs: 1000,
      }),
    ).resolves.toBe("CLEAN");
  });

  it("rejects infected content", async () => {
    const port = await startScanner("stream: Eicar-Test-Signature FOUND\0");
    await expect(
      scanWithClamAv(Buffer.from("synthetic document"), {
        host: "127.0.0.1",
        port,
        timeoutMs: 1000,
      }),
    ).resolves.toBe("INFECTED");
  });

  it("does not treat scanner errors as clean", async () => {
    const port = await startScanner("stream: scan error ERROR\0");
    await expect(
      scanWithClamAv(Buffer.from("synthetic document"), {
        host: "127.0.0.1",
        port,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow("ClamAV scan failed");
  });
});
