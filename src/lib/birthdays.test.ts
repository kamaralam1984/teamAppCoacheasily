import { describe, it as test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import { birthdayPlan, birthdaySeenKey } from "./birthdays";
import type { Profile } from "./warriors";

const person = (id: string, birthday: string | null, status = "active") =>
  ({ id, full_name: `Person ${id}`, birthday, status }) as unknown as Profile;

const DAY = "2026-10-21";

describe("What to show on a birthday", () => {
  const me = person("me", "10-21");
  const roster = [me, person("a", "10-21"), person("b", "03-02"), person("c", "10-21", "exited")];

  test("the birthday person gets the full-screen greeting", () => {
    equal(birthdayPlan(me, roster, DAY).mine, true);
  });
  test("everybody sees the other people celebrating, never themselves", () => {
    deepEqual(
      birthdayPlan(me, roster, DAY).others.map((p) => p.id),
      ["a"],
    );
  });
  test("a colleague's day is not my full-screen greeting", () => {
    const plan = birthdayPlan(roster[2]!, roster, DAY);
    equal(plan.mine, false);
    deepEqual(
      plan.others.map((p) => p.id),
      ["me", "a"],
    );
  });
  test("people who have left are not celebrated", () => {
    equal(
      birthdayPlan(roster[2]!, roster, DAY).others.some((p) => p.id === "c"),
      false,
    );
  });
  test("nothing on a day with no birthdays", () => {
    const plan = birthdayPlan(roster[2]!, roster, "2026-06-15");
    equal(plan.mine, false);
    deepEqual(plan.others, []);
  });
  test("team birthdays switched off hides the popup list but not my own greeting", () => {
    const plan = birthdayPlan(me, roster, DAY, false);
    equal(plan.mine, true);
    deepEqual(plan.others, []);
  });
  test("nobody signed in shows nothing", () => {
    deepEqual(birthdayPlan(null, roster, DAY), { mine: false, others: [] });
  });
  test("a missing or malformed birthday never matches", () => {
    equal(birthdayPlan(person("x", null), [person("x", null)], DAY).mine, false);
    equal(birthdayPlan(person("y", "garbage"), [], DAY).mine, false);
  });
  test("the seen key is per person and per day", () => {
    equal(birthdaySeenKey("me", DAY) === birthdaySeenKey("me", "2026-10-22"), false);
    equal(birthdaySeenKey("me", DAY) === birthdaySeenKey("you", DAY), false);
  });
});
