import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createUser,
  getUserById,
  getUserByEmail,
  updateLastLogin,
  registerFailedLoginAttempt,
  toUserPublic,
} from "../src/index.js";

describe("IAM User Repository Integration Tests", () => {
  let testOrgId: string;

  beforeAll(async () => {
    await runAllMigrations();
    const org = await createOrganization({
      code: "TEST_USER_ORG",
      name: "Test User Org Inc",
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'testuser%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code = 'TEST_USER_ORG';");
    await closePool();
  });

  it("creates a user with argon2id hash and retrieves by ID and email", async () => {
    const fakeArgon2Hash = "$argon2id$v=19$m=19456,t=2,p=1$fakeSalt$fakeHash12345";

    const user = await createUser({
      organizationId: testOrgId,
      email: "testuser1@jewelcore.local",
      passwordHash: fakeArgon2Hash,
      firstName: "Alice",
      lastName: "Smith",
      phone: "+1-555-0101",
      isActive: true,
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe("testuser1@jewelcore.local");
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(user.isActive).toBe(true);
    expect(user.failedLoginAttempts).toBe(0);

    const publicUser = toUserPublic(user);
    expect((publicUser as any).passwordHash).toBeUndefined();
    expect(publicUser.email).toBe("testuser1@jewelcore.local");

    const fetchedById = await getUserById(user.id);
    expect(fetchedById).not.toBeNull();
    expect(fetchedById?.firstName).toBe("Alice");

    const fetchedByEmail = await getUserByEmail("TESTUSER1@jewelcore.local");
    expect(fetchedByEmail).not.toBeNull();
    expect(fetchedByEmail?.id).toBe(user.id);
  });

  it("rejects duplicate email insertion at database level", async () => {
    await expect(
      createUser({
        organizationId: testOrgId,
        email: "testuser1@jewelcore.local",
        passwordHash: "$argon2id$v=19$fake",
        firstName: "Duplicate",
        lastName: "Attempt",
      }),
    ).rejects.toThrow();
  });

  it("tracks failed login attempts and triggers temporary lockout", async () => {
    const user = await createUser({
      organizationId: testOrgId,
      email: "testuser_lockout@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Bob",
      lastName: "Lock",
    });

    // 4 failed attempts: not locked yet (threshold = 5)
    for (let i = 1; i <= 4; i++) {
      const state = await registerFailedLoginAttempt(user.id, 5, 15);
      expect(state.failedAttempts).toBe(i);
      expect(state.isLocked).toBe(false);
    }

    // 5th failed attempt: triggers lockout
    const finalState = await registerFailedLoginAttempt(user.id, 5, 15);
    expect(finalState.failedAttempts).toBe(5);
    expect(finalState.isLocked).toBe(true);
    expect(finalState.lockedUntil).not.toBeNull();

    // Verify database record has locked_until set
    const fetched = await getUserById(user.id);
    expect(fetched?.lockedUntil).not.toBeNull();
    expect(new Date(fetched!.lockedUntil!) > new Date()).toBe(true);

    // Successful login resets counters and lockout
    await updateLastLogin(user.id);
    const resetUser = await getUserById(user.id);
    expect(resetUser?.failedLoginAttempts).toBe(0);
    expect(resetUser?.lockedUntil).toBeNull();
    expect(resetUser?.lastLoginAt).not.toBeNull();
  });
});
