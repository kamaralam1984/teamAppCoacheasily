/**
 * The Annual Manager Evaluation Form's own wording, in one place so the page and the PDF say
 * exactly what the company's Word form says.
 */
export const MANAGER_FORM_TEXT = {
  intro:
    "Use this form to review each team member's annual self-evaluation. For every goal and value, record the self-rating the team member shared, add your own rating, and give remarks or feedback that explain your rating. Complete one form per team member and discuss it with them before sign-off.",
  works:
    "The appraisal has two equal parts, matching the self-evaluation form. Rate on evidence and outcomes, not on effort or hours worked. Where your rating differs from the self-rating, your remarks must say why.",
  parts: [
    [
      "A. Goals and Impact",
      "50%",
      "The 4–5 goals agreed with the team member and the outcomes delivered",
    ],
    [
      "B. Competencies and Values",
      "50%",
      "How the team member delivered: the 12 values listed in Part B",
    ],
  ] as const,
  columns: [
    [
      "Self-rating",
      "Copy the rating exactly as the team member gave it in their self-evaluation form",
    ],
    [
      "Manager rating",
      "Your own rating on the same scale, based on the evidence and what you observed during the year",
    ],
    [
      "Manager remarks / feedback",
      "What went well, what could improve, and the reason for any difference from the self-rating",
    ],
  ] as const,
  exampleNote: "The worked example below shows the level of detail expected in your remarks.",
  exampleGoal: {
    goal: "Improve the customer experience rating from 6 to 10. Priority: customer delight and retention.",
    self: "O",
    manager: "EE",
    remarks:
      "Strong result: rating rose from 6 to 10 and the 24-hour induction plus day-20 call is now a repeatable process. Rated EE rather than O because the process has not yet been documented or handed over to the wider team. Next step: write it up as a team SOP by Q1.",
  },
  exampleValue: {
    value: "Ownership",
    self: "O",
    manager: "O",
    remarks:
      "Agree with the self-rating. Took full ownership of new-member onboarding without being asked and followed through on every case; the customer experience rating rose from 6 to 10.",
  },
  partA:
    "List each goal from the team member's self-evaluation, copy their self-rating, then add your rating and remarks. Rate the outcome delivered, not the effort.",
  partB:
    "For each value, copy the self-rating, add your rating, and give one example you observed this year that supports it.",
  partC:
    "Bring the two parts together. The final rating is your judgement across both parts, each weighted at 50%.",
  partD: "Copy the team member's self-assessment of potential, then give your own view.",
  partE:
    "Answer each question in two or three sentences. Refer to the team member's reflection (Part C of their self-evaluation) where relevant.",
  member: "To be filled in by the team member after the review discussion (optional).",
  signoff: "By signing, the manager confirms that the ratings above are based on evidence.",
};

export const SCALE = "(O / EE / FME / PME / DNME)";
export const POTENTIAL_SCALE = "(Low / Moderate / High)";
