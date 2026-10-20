import { describe, it as test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import { compareTeam, isFounder, seniority, teamOrder, validateTeamOrderInput } from "./teamOrder";
import type { Profile } from "./warriors";

const placed = (who: Profile, team_order: number | null) => ({ ...who, team_order }) as Profile;
const p = (
  full_name: string,
  title: string | null,
  role = "member",
  department = "Sales",
  manager_id: string | null = "x",
) => ({ full_name, title, role, department, manager_id, sort_order: 100 }) as unknown as Profile;

describe("How the team is listed", () => {
  const founder = p("Purushottam", "Founder & CEO", "admin", "Leadership", null);
  const hrHead = p("Shubhangi", "People & Culture (HR)", "hr", "People & Culture");
  const hrExec = p("Supriya", "HR Executive", "hr", "People & Culture");
  const salesMgr = p("Saurabh", "Sales Manager", "manager", "Sales");
  const contentHead = p("Milan", "Video Content Head", "member", "Content");
  const salesExec = p("Sushma", "Sales Executive", "member", "Sales");
  const techExec = p("Kamar", "Technology", "member", "Technology");
  const caller = p("Sarika", "Tele-caller (part-time)", "member", "Tele-calling");

  test("the founder is first, then People & Culture, then the rest", () => {
    const sorted = teamOrder([
      caller,
      salesExec,
      hrExec,
      salesMgr,
      founder,
      techExec,
      hrHead,
      contentHead,
    ]);
    deepEqual(
      sorted.slice(0, 3).map((x) => x.full_name),
      ["Purushottam", "Shubhangi", "Supriya"],
    );
  });
  test("within the rest, the post decides first: Head, then Manager, then the rest", () => {
    const rest = teamOrder([caller, salesExec, salesMgr, techExec, contentHead]).map(
      (x) => x.full_name,
    );
    equal(rest[0], "Milan");
    equal(rest[1], "Saurabh");
  });
  test("a Head who is a Warrior still sits above a Manager", () => {
    const techHead = p("Kamar", "AI Developer Engineer — Tech Head", "member", "Technology");
    const seniorCoach = p(
      "Mahadev",
      "Senior Private Coach — MCA & MCA Elite",
      "member",
      "Private Coaching",
    );
    const sorted = teamOrder([seniorCoach, salesMgr, techHead, salesExec]).map((x) => x.full_name);
    deepEqual(sorted, ["Kamar", "Saurabh", "Mahadev", "Sushma"]);
  });
  test("with the same post, the access role breaks the tie", () => {
    const warriorMgr = p("Wanda", "Sales Manager", "member", "Sales");
    equal(compareTeam(salesMgr, warriorMgr) < 0, true);
  });
  test("part-timers come last", () => {
    equal(teamOrder([caller, salesExec, techExec]).at(-1)!.full_name, "Sarika");
  });
  test("People & Culture is ordered by post too", () => {
    const sorted = teamOrder([hrExec, p("Hana", "HR Head", "hr", "People & Culture")]);
    equal(sorted[0]!.full_name, "Hana");
  });
  test("founder is found by the post, or by having no manager and no post", () => {
    equal(isFounder(founder), true);
    equal(isFounder(salesExec), false);
    equal(isFounder(p("Boss", null, "admin", "Leadership", null)), true);
    equal(isFounder(p("Cofounder", "Co-Founder", "member", "Leadership")), true);
  });
  test("seniority reads the post", () => {
    equal(seniority("Founder & CEO"), 0);
    equal(seniority("Video Content Head"), 1);
    equal(seniority("Community People Manager"), 2);
    equal(seniority("Senior Coach"), 3);
    equal(seniority("Sales Executive"), 4);
    equal(seniority("Intern"), 5);
    equal(seniority(null), 4);
  });
  test("two equals fall back to department and then name", () => {
    const a = p("Anu", "Sales Executive", "member", "Sales");
    const b = p("Bela", "Sales Executive", "member", "Sales");
    equal(compareTeam(a, b) < 0, true);
  });

  test("a place chosen by hand beats the rule", () => {
    const coach = placed(p("Mahadev", "Senior Private Coach", "member", "Private Coaching"), 10);
    const head = placed(contentHead, 20);
    deepEqual(
      teamOrder([head, coach]).map((x) => x.full_name),
      ["Mahadev", "Milan"],
    );
  });
  test("people placed come before people nobody has placed", () => {
    const coach = placed(p("Mahadev", "Senior Private Coach", "member", "Private Coaching"), 50);
    deepEqual(teamOrder([contentHead, salesMgr, coach]).map((x) => x.full_name)[0], "Mahadev");
  });
  test("with no places chosen, the rule is unchanged", () => {
    deepEqual(
      teamOrder([salesExec, salesMgr, contentHead]).map((x) => x.full_name),
      ["Milan", "Saurabh", "Sushma"],
    );
  });
  test("the same place falls back to the rule", () => {
    const a = placed(salesMgr, 10);
    const b = placed(salesExec, 10);
    equal(compareTeam(a, b) < 0, true);
  });
});

describe("What the developer panel may send for the team order", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  test("a list of people in order", () => {
    deepEqual(validateTeamOrderInput({ orderedIds: [id(1), id(2)] }), {
      orderedIds: [id(1), id(2)],
    });
  });
  test("an instruction to go back to the rule", () => {
    deepEqual(validateTeamOrderInput({ reset: true }), { reset: true });
  });
  test("nothing, not a list, or not ids is refused", () => {
    for (const bad of [
      null,
      {},
      { orderedIds: [] },
      { orderedIds: "x" },
      { orderedIds: ["not-an-id"] },
      { orderedIds: [1] },
    ]) {
      let refused = false;
      try {
        validateTeamOrderInput(bad);
      } catch {
        refused = true;
      }
      equal(refused, true);
    }
  });
  test("the same person twice is refused", () => {
    let refused = false;
    try {
      validateTeamOrderInput({ orderedIds: [id(1), id(1)] });
    } catch {
      refused = true;
    }
    equal(refused, true);
  });
});
