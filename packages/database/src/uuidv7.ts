import crypto from "node:crypto";

/**
 * Monotonic UUIDv7 Generator conforming to RFC 9562.
 *
 * MONOTONICITY GUARANTEE & SPECIFICATION:
 * -----------------------------------------
 * 1. Single-Process Sequential Generation:
 *    Within a single Node.js runtime process, all sequentially generated UUIDv7
 *    identifiers are strictly monotonically increasing in both 128-bit binary
 *    and canonical ASCII string representations (UUID_A < UUID_B for all t_A <= t_B).
 *
 * 2. Same-Millisecond Sub-Millisecond Counter:
 *    RFC 9562 Section 6.2 Method 1 is implemented using a 26-bit monotonic counter:
 *    - 12 bits placed in `rand_a` (octets 6-7).
 *    - 14 bits placed in the upper portion of `rand_b` (octets 8-9).
 *    This allows up to 67,108,864 strictly monotonic UUIDs to be generated within
 *    the exact same millisecond without counter rollover.
 *    The remaining 48 bits (octets 10-15) are populated with cryptographically secure random bytes.
 *
 * 3. Clock Rollback & Backwards Drift Handling:
 *    If the host system clock steps backwards (currentTimeMs < lastTimeMs), the generator
 *    does NOT decrease the timestamp. It holds the timestamp at `lastTimeMs` and increments
 *    the sequence counter, ensuring that time never flows backwards in generated IDs.
 *
 * 4. Distributed Multi-Node Limitation:
 *    Monotonicity is guaranteed within a single process. Across independent distributed nodes,
 *    ordering is chronological to millisecond resolution governed by NTP clock synchronization.
 *    Concurrent generation across separate nodes within the same millisecond will order by
 *    their respective random/counter bits.
 */

// State maintained for process-level monotonic generation
let lastTimestampMs = -1;
let sequenceCounter = 0;
const MAX_COUNTER = 0x3ffffff; // 26 bits = 67,108,863

/**
 * Resets internal generator state (primarily used in testing clock rollbacks).
 */
export function _resetGeneratorState(): void {
  lastTimestampMs = -1;
  sequenceCounter = 0;
}

/**
 * Generates an RFC 9562 compliant, strictly monotonic UUIDv7 string.
 */
export function uuidv7(): string {
  const bytes = uuidv7Bytes();
  return bytesToUuidv7(bytes);
}

/**
 * Generates an RFC 9562 compliant, strictly monotonic UUIDv7 as a 16-byte Uint8Array.
 */
export function uuidv7Bytes(): Uint8Array {
  let nowMs = Date.now();

  if (nowMs > lastTimestampMs) {
    // Normal case: time moved forward
    lastTimestampMs = nowMs;
    // Initialize sequence counter to a random 10-bit offset for unpredictability,
    // leaving 16 bits of headroom before any overflow could happen in that ms.
    sequenceCounter = crypto.randomBytes(2).readUInt16BE(0) & 0x3ff;
  } else if (nowMs === lastTimestampMs) {
    // Same millisecond: increment sequence counter
    sequenceCounter++;
    if (sequenceCounter > MAX_COUNTER) {
      // Counter overflowed in the same millisecond; advance virtual timestamp by 1ms
      lastTimestampMs++;
      sequenceCounter = 0;
    }
  } else {
    // Clock rollback (nowMs < lastTimestampMs): preserve monotonicity by holding lastTimestampMs
    sequenceCounter++;
    if (sequenceCounter > MAX_COUNTER) {
      lastTimestampMs++;
      sequenceCounter = 0;
    }
  }

  const timestamp = lastTimestampMs;
  const buffer = new Uint8Array(16);

  // Octets 0-5: 48-bit big-endian unix_ts_ms
  buffer[0] = (timestamp / 0x10000000000) & 0xff;
  buffer[1] = (timestamp / 0x100000000) & 0xff;
  buffer[2] = (timestamp / 0x1000000) & 0xff;
  buffer[3] = (timestamp / 0x10000) & 0xff;
  buffer[4] = (timestamp / 0x100) & 0xff;
  buffer[5] = timestamp & 0xff;

  // Counter high 12 bits -> rand_a (bits 25..14)
  const randA = (sequenceCounter >> 14) & 0x0fff;

  // Octet 6: Version (0b0111 = 7) in high 4 bits, rand_a high 4 bits in low 4 bits
  buffer[6] = 0x70 | ((randA >> 8) & 0x0f);
  // Octet 7: rand_a low 8 bits
  buffer[7] = randA & 0xff;

  // Counter low 14 bits -> rand_b upper portion (bits 13..0)
  const randBLow = sequenceCounter & 0x3fff;

  // Octet 8: Variant (0b10) in high 2 bits, rand_b high 6 bits (bits 13..8) in low 6 bits
  buffer[8] = 0x80 | ((randBLow >> 8) & 0x3f);
  // Octet 9: rand_b bits 7..0
  buffer[9] = randBLow & 0xff;

  // Octets 10-15: 48 bits of cryptographically secure random bytes
  const randomSuffix = crypto.randomBytes(6);
  buffer.set(randomSuffix, 10);

  return buffer;
}

/**
 * Converts a 16-byte Uint8Array into a canonical 36-character UUIDv7 string.
 */
export function bytesToUuidv7(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(
      `Invalid UUID byte length: expected 16, got ${bytes.length}`,
    );
  }

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Converts a canonical 36-character UUID string into a 16-byte Uint8Array.
 */
export function uuidv7ToBytes(uuid: string): Uint8Array {
  if (!isValidUuid(uuid)) {
    throw new Error(`Invalid UUID string format: "${uuid}"`);
  }

  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Validates whether a string matches standard UUID format (8-4-4-4-12 hex).
 */
export function isValidUuid(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    uuid,
  );
}

/**
 * Validates whether a string is a valid RFC 9562 UUIDv7.
 * Checks format, version bit (7), and variant bit (0b10 = 8, 9, a, or b).
 */
export function isValidUuidv7(uuid: string): boolean {
  if (!isValidUuid(uuid)) {
    return false;
  }

  // Version 7 check: character 14 must be '7'
  if (uuid.charAt(14) !== "7") {
    return false;
  }

  // Variant check: character 19 must be '8', '9', 'a', 'b', 'A', or 'B'
  const variantChar = uuid.charAt(19).toLowerCase();
  return (
    variantChar === "8" ||
    variantChar === "9" ||
    variantChar === "a" ||
    variantChar === "b"
  );
}

/**
 * Extracts the 48-bit Unix timestamp in milliseconds from a UUIDv7 string.
 */
export function extractTimestampFromUuidv7(uuid: string): number {
  if (!isValidUuidv7(uuid)) {
    throw new Error(`Cannot extract timestamp: invalid UUIDv7 "${uuid}"`);
  }

  const hex = uuid.replace(/-/g, "");
  const tsHex = hex.slice(0, 12); // First 48 bits = 12 hex characters
  return parseInt(tsHex, 16);
}

/**
 * Compares two UUIDv7 strings for monotonic ordering.
 * Returns negative if a < b, 0 if a === b, positive if a > b.
 */
export function compareUuidv7(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
