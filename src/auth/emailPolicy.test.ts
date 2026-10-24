import { describe, expect, it } from "vitest";
import examples from "../../scripts/fixtures/email-validation.json";
import { isValidEmail } from "./emailPolicy";

describe("email validation shared with the backend", () => {
  it.each(examples.valid)("accepts %j", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(examples.invalid)("rejects %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it("accepts length boundaries and rejects addresses exceeding them", () => {
    const local = "a".repeat(64);
    const label = "b".repeat(63);
    const longest = `${local}@${label}.${label}.${"c".repeat(61)}`;
    expect(longest.length).toBe(254);
    for (const email of [`${local}@example.com`, `ana@${label}.com`, longest]) {
      expect(isValidEmail(email), email).toBe(true);
    }
    for (const email of [`${"a".repeat(65)}@example.com`, `ana@${"b".repeat(64)}.com`, `${longest}c`]) {
      expect(isValidEmail(email), email).toBe(false);
    }
  });
});
