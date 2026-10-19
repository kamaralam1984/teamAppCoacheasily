import { describe, expect, test } from "bun:test";
import { assertDevDataProfileUpdate } from "./developerTables";

describe("Developer Data profile updates", () => {
  for (const key of ["title", "department", "manager_id", "role", "opening_earned_leave"]) {
    test(`rejects protected ${key}, including explicit null`, () => {
      expect(() => assertDevDataProfileUpdate({ [key]: null })).toThrow();
      expect(() => assertDevDataProfileUpdate({ [key]: "changed" })).toThrow();
    });
  }
  test("leaves unprotected profile updates available", () => {
    expect(() => assertDevDataProfileUpdate({ bio: "Updated biography", phone: null })).not.toThrow();
  });
});