import { describe, it as test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import {
  isNewWarrior,
  isOffOn,
  weeklyOffDays,
  weeklyOffLabel,
  weeklyOffValue,
  type Profile,
} from "./warriors";

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

describe("A weekly off of one day or more", () => {
  test("one day, two days, or no fixed day", () => {
    deepEqual(weeklyOffDays("Sunday"), ["Sunday"]);
    deepEqual(weeklyOffDays("Sunday,Saturday"), ["Sunday", "Saturday"]);
    deepEqual(weeklyOffDays("Based on work"), []);
    deepEqual(weeklyOffDays(null), []);
  });
  test("a day is off only when it is in the list", () => {
    equal(isOffOn("Saturday,Sunday", "Saturday"), true);
    equal(isOffOn("Saturday,Sunday", "Sunday"), true);
    equal(isOffOn("Saturday,Sunday", "Friday"), false);
    equal(isOffOn("Sunday", "Saturday"), false);
    equal(isOffOn("Based on work", "Sunday"), false);
    equal(isOffOn(null, "Sunday"), false);
  });
  test("stored in week order and shown with an ampersand", () => {
    equal(weeklyOffValue(["Saturday", "Sunday"]), "Sunday,Saturday");
    equal(weeklyOffLabel("Sunday,Saturday"), "Sunday & Saturday");
    equal(weeklyOffLabel("Based on work"), "Based on work");
    equal(weeklyOffLabel(null), "");
  });
});
