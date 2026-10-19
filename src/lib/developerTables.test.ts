import { describe, it as test } from "node:test";
import { throws, doesNotThrow } from "node:assert/strict";
import { assertDevDataProfileUpdate } from "./developerTables";

describe("Developer Data profile updates", () => {
  for (const key of ["title", "department", "manager_id", "role", "opening_earned_leave"]) {
    test(`rejects protected ${key}, including explicit null`, () => {
      throws(() => assertDevDataProfileUpdate({ [key]: null }));
      throws(() => assertDevDataProfileUpdate({ [key]: "changed" }));
    });
  }
  test("leaves unprotected profile updates available", () => {
    doesNotThrow(() => assertDevDataProfileUpdate({ bio: "Updated biography", phone: null }));
  });
});