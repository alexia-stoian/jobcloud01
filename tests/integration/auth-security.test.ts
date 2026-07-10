import { describe, expect, test } from "vitest";
import { generateTokenPair } from "@/auth/password";

describe("auth token generation", () => {
  test("generates token and hash", () => {
    const tokenPair = generateTokenPair();
    expect(tokenPair.token).toHaveLength(64);
    expect(tokenPair.tokenHash).toHaveLength(64);
    expect(tokenPair.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
