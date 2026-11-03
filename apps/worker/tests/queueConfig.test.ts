import { describe, it, expect } from "vitest";
import {
  QUEUE_NAMES,
  defaultJobOptions,
  dlqJobOptions,
} from "../src/infrastructure/queueConfig.js";

describe("BullMQ Queue & Job Options Standards (Component C)", () => {
  it("defines standard queue identifiers", () => {
    expect(QUEUE_NAMES.DOMAIN_EVENTS).toBe("jewelcore:events:domain");
    expect(QUEUE_NAMES.DEAD_LETTER).toBe("jewelcore:events:dlq");
    expect(QUEUE_NAMES.RFID_JOBS).toBe("jewelcore:rfid:jobs");
  });

  it("configures standard job options with exponential backoff and 3 retry attempts", () => {
    expect(defaultJobOptions.attempts).toBe(3);
    expect(defaultJobOptions.backoff).toEqual({
      type: "exponential",
      delay: 1000,
    });
    expect(defaultJobOptions.removeOnComplete).toEqual({
      age: 86400,
      count: 1000,
    });
    expect(defaultJobOptions.removeOnFail).toEqual({
      age: 604800,
      count: 5000,
    });
  });

  it("configures Dead-Letter Queue options preventing automatic retry or premature cleanup", () => {
    expect(dlqJobOptions.attempts).toBe(1);
    expect(dlqJobOptions.removeOnComplete).toBe(false);
    expect(dlqJobOptions.removeOnFail).toBe(false);
  });
});
