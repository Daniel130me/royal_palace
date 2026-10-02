import net from "node:net";
import { once } from "node:events";

export type MalwareScanResult = "CLEAN" | "INFECTED";

const CLAMAV_CHUNK_BYTES = 64 * 1024;
const MAX_CLAMAV_RESPONSE_BYTES = 4096;

export async function scanWithClamAv(
  bytes: Uint8Array,
  options: { host: string; port: number; timeoutMs: number },
): Promise<MalwareScanResult> {
  const socket = net.createConnection({ host: options.host, port: options.port });
  socket.setTimeout(options.timeoutMs);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => {
        socket.off("error", reject);
        resolve();
      });
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("ClamAV connection timeout")));
    });
    socket.write("zINSTREAM\0");
    for (let offset = 0; offset < bytes.length; offset += CLAMAV_CHUNK_BYTES) {
      const chunk = bytes.subarray(offset, offset + CLAMAV_CHUNK_BYTES);
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(chunk.length);
      if (!socket.write(length)) await once(socket, "drain");
      if (!socket.write(chunk)) await once(socket, "drain");
    }
    socket.write(Buffer.alloc(4));

    return await new Promise<MalwareScanResult>((resolve, reject) => {
      let response = "";
      socket.on("data", (chunk: Buffer) => {
        response += chunk.toString("utf8");
        if (response.length > MAX_CLAMAV_RESPONSE_BYTES) {
          reject(new Error("ClamAV response exceeds limit"));
        } else if (response.includes("\0") || response.includes("\n")) {
          if (/^stream: .+ FOUND(?:\0|\n)/.test(response)) resolve("INFECTED");
          else if (/^stream: OK(?:\0|\n)/.test(response)) resolve("CLEAN");
          else reject(new Error("ClamAV scan failed"));
        }
      });
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("ClamAV scan timeout")));
      socket.once("close", () => reject(new Error("ClamAV closed without a result")));
    });
  } finally {
    socket.destroy();
  }
}
