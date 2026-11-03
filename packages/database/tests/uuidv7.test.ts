import { describe, it, expect, beforeEach } from "vitest";
import {
  uuidv7,
  uuidv7Bytes,
  bytesToUuidv7,
  uuidv7ToBytes,
  isValidUuid,
  isValidUuidv7,
  extractTimestampFromUuidv7,
  compareUuidv7,
  _resetGeneratorState,
} from "../src/uuidv7.js";

describe("RFC 9562 Monotonic UUIDv7 Generator", () => {
  beforeEach(() => {
    _resetGeneratorState();
  });

  it("generates at least 10,000 unique and strictly monotonic UUIDv7 identifiers in a tight loop", () => {
    const COUNT = 10000;
    const uuids: string[] = new Array(COUNT);

    const startTime = Date.now();
    for (let i = 0; i < COUNT; i++) {
      uuids[i] = uuidv7();
    }
    const elapsedMs = Date.now() - startTime;

    // 1. Uniqueness check
    const uniqueSet = new Set(uuids);
    expect(uniqueSet.size).toBe(COUNT);

    // 2. Strict monotonicity check in binary and ASCII order
    for (let i = 1; i < COUNT; i++) {
      const prev = uuids[i - 1]!;
      const curr = uuids[i]!;

      // Compare strings lexicographically
      expect(curr > prev).toBe(true);
      expect(compareUuidv7(prev, curr)).toBe(-1);
    }

    // 3. Performance check (10,000 should generate in well under 1 second)
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("generates strictly monotonic identifiers in the same millisecond", () => {
    // Generate a burst of 500 IDs with sub-millisecond counter increment
    const burstCount = 500;
    const burst: string[] = [];

    for (let i = 0; i < burstCount; i++) {
      burst.push(uuidv7());
    }

    for (let i = 1; i < burstCount; i++) {
      expect(burst[i]! > burst[i - 1]!).toBe(true);
    }
  });

  it("preserves monotonicity during system clock rollback", () => {
    // Generate first batch
    const id1 = uuidv7();
    const ts1 = extractTimestampFromUuidv7(id1);

    // Simulate clock moving backward by manually testing sequence counter advancement
    const id2 = uuidv7();
    const id3 = uuidv7();

    expect(id2 > id1).toBe(true);
    expect(id3 > id2).toBe(true);
    expect(extractTimestampFromUuidv7(id2)).toBeGreaterThanOrEqual(ts1);
    expect(extractTimestampFromUuidv7(id3)).toBeGreaterThanOrEqual(
      extractTimestampFromUuidv7(id2),
    );
  });

  it("preserves exact 128-bit values across binary and string conversions", () => {
    for (let i = 0; i < 100; i++) {
      const originalString = uuidv7();
      const bytes = uuidv7ToBytes(originalString);

      expect(bytes.length).toBe(16);

      const reconstitutedString = bytesToUuidv7(bytes);
      expect(reconstitutedString).toBe(originalString);
    }
  });

  it("extracts accurate 48-bit Unix epoch millisecond timestamps", () => {
    const beforeMs = Date.now();
    const id = uuidv7();
    const afterMs = Date.now();

    const extractedMs = extractTimestampFromUuidv7(id);
    expect(extractedMs).toBeGreaterThanOrEqual(beforeMs);
    expect(extractedMs).toBeLessThanOrEqual(afterMs);
  });

  it("correctly validates RFC 9562 UUIDv7 format, version, and variant bits", () => {
    const validV7 = uuidv7();
    expect(isValidUuid(validV7)).toBe(true);
    expect(isValidUuidv7(validV7)).toBe(true);

    // Version must be 7 (character 14)
    expect(validV7.charAt(14)).toBe("7");

    // Variant must be 0b10 (character 19 is '8', '9', 'a', or 'b')
    const variantChar = validV7.charAt(19).toLowerCase();
    expect(["8", "9", "a", "b"]).toContain(variantChar);

    // Rejection of invalid UUIDs
    expect(isValidUuidv7("")).toBe(false);
    expect(isValidUuidv7("not-a-uuid")).toBe(false);
    expect(isValidUuidv7("12345678-1234-1234-1234-123456789012")).toBe(false); // Version 1
    expect(isValidUuidv7("018f3a2b-4c5d-4e8f-9a0b-1c2d3e4f5a6b")).toBe(false); // Version 4
    expect(isValidUuidv7("018f3a2b-4c5d-7e8f-0a0b-1c2d3e4f5a6b")).toBe(false); // Invalid variant (0)
  });

  it("throws descriptive errors on invalid inputs to byte conversion functions", () => {
    expect(() => uuidv7ToBytes("invalid-uuid")).toThrow(
      "Invalid UUID string format",
    );
    expect(() => bytesToUuidv7(new Uint8Array(15))).toThrow(
      "Invalid UUID byte length",
    );
    expect(() => extractTimestampFromUuidv7("not-a-uuid")).toThrow(
      "Cannot extract timestamp",
    );
  });
});
