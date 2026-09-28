import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";
const IV_BYTES = 12;

export class SecretBoxError extends Error {
  constructor(message = "Encrypted value is invalid") {
    super(message);
    this.name = "SecretBoxError";
  }
}

/** Authenticated encryption for short-lived references and provider secrets. */
export class SecretBox {
  private readonly key: Buffer;

  constructor(
    keyBase64: string,
    private readonly keyId: string,
  ) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.byteLength !== 32) throw new SecretBoxError("Encryption key must be 32 bytes");
    if (keyId.length === 0) throw new SecretBoxError("Encryption key identifier is required");
  }

  seal(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      FORMAT_VERSION,
      this.keyId,
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
  }

  open(value: string, context: string): string {
    const [version, keyId, ivValue, ciphertextValue, tagValue, ...unexpected] = value.split(".");
    if (
      version !== FORMAT_VERSION ||
      keyId !== this.keyId ||
      ivValue === undefined ||
      ciphertextValue === undefined ||
      tagValue === undefined ||
      unexpected.length > 0
    ) {
      throw new SecretBoxError();
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivValue, "base64url"));
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new SecretBoxError();
    }
  }
}

/** Reads old keys during rotation while writing only with the configured active key. */
export class KeyRingSecretBox {
  private readonly boxes: ReadonlyMap<string, SecretBox>;

  constructor(
    keys: Readonly<Record<string, string>>,
    private readonly activeKeyId: string,
  ) {
    this.boxes = new Map(
      Object.entries(keys).map(([keyId, key]) => [keyId, new SecretBox(key, keyId)]),
    );
    if (!this.boxes.has(activeKeyId))
      throw new SecretBoxError("Active encryption key is unavailable");
  }

  get keyId(): string {
    return this.activeKeyId;
  }

  seal(plaintext: string, context: string): string {
    const box = this.boxes.get(this.activeKeyId);
    if (box === undefined) throw new SecretBoxError("Active encryption key is unavailable");
    return box.seal(plaintext, context);
  }

  open(value: string, context: string): string {
    const [, keyId] = value.split(".", 3);
    if (keyId === undefined) throw new SecretBoxError();
    const box = this.boxes.get(keyId);
    if (box === undefined) throw new SecretBoxError("Encryption key is unavailable");
    return box.open(value, context);
  }
}
