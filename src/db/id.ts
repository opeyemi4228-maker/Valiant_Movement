/**
 * UUIDv7 (RFC 9562) — time-ordered UUIDs generated app-side.
 *
 * Why not gen_random_uuid()? Random v4 keys scatter inserts across the whole
 * B-tree; at hundreds of millions of rows that means every insert dirties a
 * random index page (write amplification, cache misses, WAL bloat). v7 keys
 * are millisecond-prefixed, so inserts append to the right edge of the index
 * — the same access pattern as a bigserial, while staying globally unique and
 * unguessable. Columns keep DEFAULT gen_random_uuid() as a fallback so raw
 * SQL inserts still work; Drizzle inserts use this generator.
 *
 * Uses the Web Crypto API, available in Node 18+, edge, and browsers.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48-bit big-endian Unix timestamp in milliseconds
  const ts = Date.now();
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
