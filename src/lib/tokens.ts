import { createHash, createHmac, randomBytes } from "crypto";

/** Cryptographically-random, URL-safe token (for cookies / email links). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 of a token — store this, never the raw token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keyed (HMAC) hash of a NIN for unique lookup without storing the raw value. */
export function hashNin(nin: string, secret: string): string {
  return createHmac("sha256", secret).update(nin).digest("hex");
}
