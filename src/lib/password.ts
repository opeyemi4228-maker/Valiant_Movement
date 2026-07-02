import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(_scrypt);
const KEY_LEN = 64;

/**
 * Password hashing with Node's built-in scrypt — no native deps, no edge
 * incompatibilities. Format: `scrypt$<saltHex>$<hashHex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const target = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, KEY_LEN)) as Buffer;
  return derived.length === target.length && timingSafeEqual(derived, target);
}
