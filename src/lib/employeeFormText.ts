/**
 * The Annual Self-Evaluation Form's own wording (the employee's form), in one place so the page
 * and the PDF say exactly what the company's form says.
 */
export const EMPLOYEE_FORM_TEXT = {
  intro:
    "Use this form for your annual self-evaluation. It shows your manager what you delivered and how you worked, and it is your starting point for next year’s goals.",
  works:
    "Your appraisal has two equal parts. Rate yourself on evidence, not on effort or hours worked, and be specific: give a number, a date, or a client or learner outcome.",
  parts: [
    [
      "A. Goals and Impact",
      "50%",
      "The 4–5 goals agreed with your manager and the outcomes you delivered",
    ],
    ["B. Competencies and Values", "50%", "How you delivered: the 12 values listed in Part B"],
  ] as const,
  exampleNote:
    "The worked example below shows the level of detail expected. Read it, then complete your own goals in Part A.",
  tip: "Tip: make every target measurable. For example, “Convert 15 leads a month” for a sales role, or “Customer experience rating of 10 on a 10-point scale” for a customer experience role.",
  exampleGoals: [
    {
      goal: "Improve the customer experience rating. Company priority: customer delight and retention.",
      target: "Customer experience rating of 10 on a 10-point scale (starting point: 6)",
      result: "Rating improved from 6 to 10",
      evidence:
        "As soon as a new member onboarded with us, I did the customer check and gave the induction within 24 hours. After 20 days, I made a sanity-check call to confirm things were going well on the customer’s side, and ended by asking for feedback. This raised the ratings. Evidence: customer experience rating report and customer feedback received.",
      rating: "Outstanding (O)",
    },
  ],
  partA: (year: number) =>
    `List the 4–5 goals you agreed with your manager in January ${year} and rate each on the outcome delivered, not on the effort.`,
  partB:
    "For each value, read what it looks like in practice, rate yourself, and give one real example from this year: what happened, what you did and what changed.",
  exampleValue: {
    value: "Ownership",
    practice: "I take responsibility for outcomes and follow through without being chased",
    example:
      "What happened: new customers were rating their experience only 6 out of 10. What I did: I took ownership of every new member’s first 20 days, with induction within 24 hours, a sanity-check call on day 20 and a request for feedback. What changed: the customer experience rating rose to 10 out of 10, with customer feedback as evidence.",
    rating: "O",
  },
  partC: "Answer each question in two or three sentences.",
  signoff: "By signing, I confirm that the evidence above is accurate.",
};
