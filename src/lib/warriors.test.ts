import { describe, it as test } from "node:test";
import { equal } from "node:assert/strict";
import { isNewWarrior, type Profile } from "./warriors";

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const who = (joined_on: string | null, new_badge: string | null = null) =>
  ({ joined_on, new_badge }) as unknown as Profile;

describe("Who is a new warrior", () => {
  test("somebody who joined within the last 90 days", () => {
    equal(isNewWarrior(who(ago(0))), true);
    equal(isNewWarrior(who(ago(30))), true);
    equal(isNewWarrior(who(ago(89))), true);
  });
  test("not somebody who joined 90 days ago or more", () => {
    equal(isNewWarrior(who(ago(90))), false);
    equal(isNewWarrior(who(ago(400))), false);
    equal(isNewWarrior(who("2019-06-01")), false);
  });
  test("not somebody whose joining date is unknown, or still in the future", () => {
    equal(isNewWarrior(who(null)), false);
    equal(isNewWarrior(who(ago(-5))), false);
  });
  test("HR can switch the badge on or off by hand", () => {
    equal(isNewWarrior(who(ago(400), "on")), true);
    equal(isNewWarrior(who(ago(5), "off")), false);
  });
});
