import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("password", () => {
  it("hashes a password", () => {
    expect(hashPassword("secret")).toBe("hashed_secret");
  });

  it("verifies a password", () => {
    expect(verifyPassword("secret", "hashed_secret")).toBe(true);
  });
});
