import {
  MANAGER_FEEDBACK,
  MANAGER_POTENTIAL,
  POTENTIAL,
  RATING_LABEL,
  RATING_MEANING,
  RATINGS,
  RECOMMENDATIONS,
  REFLECTION,
  VALUES,
  type FormLike,
  type ManagerExtra,
  type ReviewLike,
} from "@/lib/selfEvaluation";
import { EMPLOYEE_FORM_TEXT } from "@/lib/employeeFormText";
import { MANAGER_FORM_TEXT, POTENTIAL_SCALE, SCALE } from "@/lib/managerFormText";

export interface PdfInput {
  year: number;
  name: string;
  form: FormLike;
  signedName: string | null;
  signedAt: string | null;
  submittedAt: string | null;
  /** only the reviews the viewer may see; left out of the PDF when empty */
  reviews: ReviewLike[];
  finalRating: string | null;
}

const ADDRESS = [
  "Shop No. 105, 2nd Floor,",
  "Eaze Zone Mall,",
  "Off Link Road, Mumbai Suburban,",
  "Mumbai, Maharashtra – 400064",
  "www.coacheasily.com",
];

/** Characters the PDF's built-in font can't draw become plain ones. */
function clean(s: string | null | undefined): string {
  const plain = (s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u20B9/g, "Rs ");
  // keep tabs, new lines and Latin-1 only
  return Array.from(plain)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255);
    })
    .join("");
}

/** The filled form as a PDF in the company form's layout (A4, letterhead, tables). */
/** An A4 page set in the company form's layout: letterhead, title, tables, page footer. */
async function startDoc(title: string, year: number, footerLabel: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = 595;
  const H = 842;
  const M = 40;
  const usable = W - M * 2;
  const footer = `SWARAJYA · CoachEasily | ${footerLabel} ${year}`;
  let y = 0;

  const letterhead = () => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(90);
    ADDRESS.forEach((line, i) => pdf.text(clean(line), W - M, 34 + i * 10, { align: "right" }));
    pdf.setDrawColor(200);
    pdf.line(M, 92, W - M, 92);
    y = 108;
  };
  const newPage = () => {
    pdf.addPage();
    letterhead();
  };
  const room = (h: number) => {
    if (y + h > H - 50) newPage();
  };

  const heading = (text: string, size = 13) => {
    // keep a heading with the start of what follows it
    room(size + 90);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(size);
    pdf.setTextColor(20);
    pdf.text(clean(text), M, y + size);
    y += size + 10;
  };
  const para = (text: string, size = 9, italic = false) => {
    pdf.setFont("helvetica", italic ? "italic" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(60);
    const lines = pdf.splitTextToSize(clean(text), usable) as string[];
    for (const l of lines) {
      room(size + 4);
      pdf.text(l, M, y + size);
      y += size + 3;
    }
    y += 6;
  };

  /** A table: widths are fractions of the page; long rows carry over to the next page. */
  const table = (head: string[], widths: number[], rows: string[][]) => {
    const SIZE = 8.5;
    const LINE = 11;
    const PAD = 4;
    const ws = widths.map((w) => w * usable);
    const drawRow = (cells: string[], bold: boolean) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(SIZE);
      let lines = cells.map(
        (c, i) => pdf.splitTextToSize(clean(c) || " ", ws[i]! - PAD * 2) as string[],
      );
      while (lines.some((l) => l.length > 0)) {
        const fit = Math.max(1, Math.floor((H - 50 - y - PAD * 2) / LINE));
        const most = Math.max(...lines.map((l) => l.length));
        if (fit < Math.min(most, 3) && y > 120) {
          newPage();
          continue;
        }
        const take = Math.min(most, fit);
        const h = take * LINE + PAD * 2;
        let x = M;
        lines.forEach((l, i) => {
          if (bold) {
            pdf.setFillColor(246, 226, 160);
            pdf.rect(x, y, ws[i]!, h, "F");
          }
          pdf.setDrawColor(190);
          pdf.rect(x, y, ws[i]!, h);
          pdf.setTextColor(25);
          l.slice(0, take).forEach((t, j) => pdf.text(t, x + PAD, y + PAD + SIZE + j * LINE));
          x += ws[i]!;
        });
        y += h;
        lines = lines.map((l) => l.slice(take));
        if (lines.some((l) => l.length > 0)) newPage();
      }
    };
    room(40);
    drawRow(head, true);
    for (const r of rows) drawRow(r, false);
    y += 12;
  };

  letterhead();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(20);
  pdf.text(title, W / 2, y + 14, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`For the year January ${year} to December ${year}`, W / 2, y + 30, {
    align: "center",
  });
  y += 48;

  const finish = () => {
    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      pdf.text(clean(footer), M, H - 24);
      pdf.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: "right" });
    }
    return new Uint8Array(pdf.output("arraybuffer"));
  };
  return { heading, para, table, newPage, finish };
}

export async function buildSelfEvalPdf(input: PdfInput): Promise<Uint8Array> {
  const E = EMPLOYEE_FORM_TEXT;
  const { heading, para, table, finish } = await startDoc(
    "ANNUAL SELF-EVALUATION FORM",
    input.year,
    "Annual Self-Evaluation",
  );
  const sr = `Self-rating\n${SCALE}`;
  para(E.intro);

  heading("About you");
  table(
    ["Field", "Your response"],
    [0.32, 0.68],
    [
      ["Name", input.name],
      ["Role / team", input.form.role_team ?? ""],
      ["Manager", input.form.manager_name ?? ""],
      ["Review period", input.form.review_period ?? ""],
      [
        "Date completed",
        input.submittedAt ? new Date(input.submittedAt).toLocaleDateString("en-IN") : "",
      ],
    ],
  );

  heading("How this form works");
  para(E.works);
  table(
    ["Part", "Weight", "What it covers"],
    [0.3, 0.12, 0.58],
    E.parts.map((x) => [...x]),
  );
  para("Use this rating scale for every rating.");
  table(
    ["Rating", "What it means"],
    [0.35, 0.65],
    RATINGS.map((r) => [RATING_LABEL[r], RATING_MEANING[r]]),
  );

  const goalHead = [
    "#",
    "Goal and the company priority it supports",
    "Target / measure",
    "Result achieved",
    "Evidence (numbers, links, feedback)",
    sr,
  ];
  const goalWidths = [0.05, 0.2, 0.15, 0.17, 0.29, 0.14];
  heading("Example: how to fill in your goals");
  para(E.exampleNote);
  para(E.tip);
  para("EXAMPLE  For guidance only. Do not fill in this table.", 8.5, true);
  table(goalHead, goalWidths, [
    ...E.exampleGoals.map((g, i) => [
      String(i + 1),
      g.goal,
      g.target,
      g.result,
      g.evidence,
      g.rating,
    ]),
    [String(E.exampleGoals.length + 1), "", "", "", "", ""],
  ]);

  heading("Part A: Goals and Impact (50%)");
  para(E.partA(input.year));
  table(
    goalHead,
    goalWidths,
    input.form.goals
      .filter((g) => g.goal || g.target || g.result || g.evidence || g.rating)
      .map((g, i) => [
        String(i + 1),
        g.goal ?? "",
        g.target ?? "",
        g.result ?? "",
        g.evidence ?? "",
        g.rating ?? "",
      ]),
  );

  const valueHead = ["Value", "What it looks like in practice", "Your example from this year", sr];
  const valueWidths = [0.15, 0.24, 0.47, 0.14];
  heading("Part B: Competencies and Values (50%)");
  para(E.partB);
  para("EXAMPLE  How to fill in one value. For guidance only.", 8.5, true);
  table(valueHead, valueWidths, [
    [E.exampleValue.value, E.exampleValue.practice, E.exampleValue.example, E.exampleValue.rating],
  ]);
  table(
    valueHead,
    valueWidths,
    VALUES.map((v) => [
      v.name,
      "",
      input.form.value_answers[v.key]?.example ?? "",
      input.form.value_answers[v.key]?.rating ?? "",
    ]),
  );

  heading("Part C: Reflection");
  para(E.partC);
  table(
    ["Question", "Your response"],
    [0.35, 0.65],
    REFLECTION.map((q) => [q.question, input.form.reflection[q.key] ?? ""]),
  );

  heading("Part D: Potential, Growth and Next Year");
  table(
    ["Potential question", "Your rating\n(Low / Moderate / High)", "Why"],
    [0.35, 0.2, 0.45],
    POTENTIAL.map((q) => [
      q.question,
      input.form.potential[q.key]?.rating ?? "",
      input.form.potential[q.key]?.why ?? "",
    ]),
  );

  heading("Sign-off");
  para(E.signoff);
  table(
    ["Field", ""],
    [0.32, 0.68],
    [
      ["Employee name", input.name],
      ["Signature", input.signedName ? `${input.signedName} (signed in the Team App)` : ""],
      ["Date", input.signedAt ? new Date(input.signedAt).toLocaleDateString("en-IN") : ""],
    ],
  );
  return finish();
}

export interface ManagerPdfInput {
  year: number;
  personName: string;
  roleTeam: string;
  reviewPeriod: string;
  reviewerName: string;
  receivedOn: string | null;
  completedOn: string | null;
  form: FormLike;
  review: ReviewLike | null;
  extra: ManagerExtra;
  memberComment: string;
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN") : "";

/** The manager evaluation as a PDF in the "Annual Manager Evaluation Form" layout. */
export async function buildManagerEvalPdf(input: ManagerPdfInput): Promise<Uint8Array> {
  const T = MANAGER_FORM_TEXT;
  const { heading, para, table, finish } = await startDoc(
    "ANNUAL MANAGER EVALUATION FORM",
    input.year,
    "Annual Manager Evaluation",
  );
  const { form, review, extra } = input;
  const r = (x: string | undefined | null) => x ?? "";
  const sr = `Self-rating\n${SCALE}`;
  const mr = `Manager rating\n${SCALE}`;
  para(T.intro);

  heading("About this review");
  table(
    ["Field", "Details"],
    [0.35, 0.65],
    [
      ["Team member name", input.personName],
      ["Role / team", input.roleTeam],
      ["Manager (reviewer)", input.reviewerName],
      ["Review period", input.reviewPeriod],
      ["Self-evaluation received on", day(input.receivedOn)],
      ["Review discussion date", day(extra.discussion_date)],
      ["Date completed", day(input.completedOn)],
    ],
  );

  heading("How this form works");
  para(T.works);
  table(
    ["Part", "Weight", "What it covers"],
    [0.3, 0.12, 0.58],
    T.parts.map((x) => [...x]),
  );
  heading("How to complete each section", 11);
  table(
    ["Column", "What to enter"],
    [0.3, 0.7],
    T.columns.map((x) => [...x]),
  );
  para("Use this rating scale for every rating.");
  table(
    ["Rating", "What it means"],
    [0.35, 0.65],
    RATINGS.map((x) => [RATING_LABEL[x], RATING_MEANING[x]]),
  );

  heading("Example: how to fill in a goal");
  para(T.exampleNote);
  para("EXAMPLE  For guidance only. Do not fill in this table.", 8.5, true);
  table(
    ["#", "Goal (as listed by the team member)", sr, mr, "Manager remarks / feedback"],
    [0.05, 0.27, 0.13, 0.13, 0.42],
    [["1", T.exampleGoal.goal, T.exampleGoal.self, T.exampleGoal.manager, T.exampleGoal.remarks]],
  );

  heading("Part A: Goals and Impact (50%)");
  para(T.partA);
  const rows = Math.max(5, form.goals.filter((g) => g.goal || g.rating).length);
  table(
    ["#", "Goal (as listed by the team member)", sr, mr, "Manager remarks / feedback"],
    [0.05, 0.31, 0.13, 0.13, 0.38],
    Array.from({ length: rows }, (_, i) => {
      const g = form.goals[i] ?? {};
      return [
        String(i + 1),
        r(g.goal),
        r(g.rating),
        r(review?.goal_ratings[String(i)]?.rating),
        r(review?.goal_ratings[String(i)]?.comment),
      ];
    }),
  );
  table(
    ["Part A summary", sr, mr, "Overall remarks on goals"],
    [0.28, 0.13, 0.13, 0.46],
    [
      [
        "Overall Goals and Impact",
        r(extra.goals_summary?.self_rating),
        r(extra.goals_summary?.rating),
        r(extra.goals_summary?.remarks),
      ],
    ],
  );

  heading("Part B: Competencies and Values (50%)");
  para(T.partB);
  para("EXAMPLE  How to fill in one value. For guidance only.", 8.5, true);
  table(
    ["Value", sr, mr, "Manager remarks / feedback (example observed)"],
    [0.18, 0.13, 0.13, 0.56],
    [[T.exampleValue.value, T.exampleValue.self, T.exampleValue.manager, T.exampleValue.remarks]],
  );
  table(
    ["Value", sr, mr, "Manager remarks / feedback (example observed)"],
    [0.18, 0.13, 0.13, 0.56],
    VALUES.map((v) => [
      v.name,
      r(form.value_answers[v.key]?.rating),
      r(review?.value_ratings[v.key]?.rating),
      r(review?.value_ratings[v.key]?.comment),
    ]),
  );
  table(
    ["Part B summary", sr, mr, "Overall remarks on values"],
    [0.28, 0.13, 0.13, 0.46],
    [
      [
        "Overall Competencies and Values",
        r(extra.values_summary?.self_rating),
        r(extra.values_summary?.rating),
        r(extra.values_summary?.remarks),
      ],
    ],
  );

  heading("Part C: Overall Manager Ratings & Remarks");
  para(T.partC);
  table(
    ["Component", "Weight", sr, mr, "Remarks"],
    [0.26, 0.09, 0.13, 0.13, 0.39],
    [
      [
        "A. Goals and Impact",
        "50%",
        r(extra.overall?.goals?.self_rating),
        r(extra.overall?.goals?.rating),
        r(extra.overall?.goals?.remarks),
      ],
      [
        "B. Competencies and Values",
        "50%",
        r(extra.overall?.values?.self_rating),
        r(extra.overall?.values?.rating),
        r(extra.overall?.values?.remarks),
      ],
    ],
  );

  heading("Part D: Readiness of Talent");
  para(T.partD);
  table(
    [
      "Potential question",
      `Self-rating\n${POTENTIAL_SCALE}`,
      `Manager rating\n${POTENTIAL_SCALE}`,
      "Manager remarks",
    ],
    [0.36, 0.15, 0.15, 0.34],
    POTENTIAL.map((q) => [
      MANAGER_POTENTIAL[q.key],
      r(form.potential[q.key]?.rating),
      r(extra.potential?.[q.key]?.rating),
      r(extra.potential?.[q.key]?.remarks),
    ]),
  );

  heading("Part E: Manager Feedback");
  para(T.partE);
  table(
    ["Question", "Manager response"],
    [0.4, 0.6],
    MANAGER_FEEDBACK.map((q) => [q.question, r(extra.feedback?.[q.key])]),
  );

  heading("Recommendation");
  table(
    ["Recommendation", "Tick one\n(X)", "Comments"],
    [0.36, 0.12, 0.52],
    RECOMMENDATIONS.map((x) => [
      x.label,
      extra.recommendation?.choice === x.key ? "X" : "",
      r(extra.recommendation?.comments?.[x.key]),
    ]),
  );

  heading("Internal or Customer Feedback for Team Member");
  para(T.member, 8.5, true);
  table(["Comments on this evaluation", ""], [0.35, 0.65], [["", input.memberComment]]);

  heading("Sign-off");
  para(T.signoff);
  table(
    ["Field", "Manager"],
    [0.35, 0.65],
    [
      ["Name", extra.signed_name ? input.reviewerName : ""],
      ["Signature", extra.signed_name ? `${extra.signed_name} (signed in the Team App)` : ""],
      ["Date", day(extra.signed_at)],
    ],
  );
  return finish();
}
