import {
  POTENTIAL,
  RATING_LABEL,
  RATING_MEANING,
  RATINGS,
  REFLECTION,
  REVIEW_KINDS,
  REVIEW_LABEL,
  VALUES,
  isRating,
  type FormLike,
  type ReviewLike,
} from "@/lib/selfEvaluation";

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

const rating = (r: string | null | undefined) => (isRating(r) ? RATING_LABEL[r] : clean(r));

/** The filled form as a PDF in the company form's layout (A4, letterhead, tables). */
export async function buildSelfEvalPdf(input: PdfInput): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = 595;
  const H = 842;
  const M = 40;
  const usable = W - M * 2;
  const footer = `SWARAJYA · CoachEasily | Annual Self-Evaluation ${input.year}`;
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
    room(size + 18);
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

  // ── page 1 ──
  letterhead();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(20);
  pdf.text("ANNUAL SELF-EVALUATION FORM", W / 2, y + 14, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`For the year January ${input.year} to December ${input.year}`, W / 2, y + 30, {
    align: "center",
  });
  y += 48;
  para(
    "Use this form for your annual self-evaluation. It shows your manager what you delivered and how you worked, and it is your starting point for next year's goals.",
  );

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
  para(
    "Your appraisal has two equal parts. Rate yourself on evidence, not on effort or hours worked, and be specific: give a number, a date, or a client or learner outcome.",
  );
  table(
    ["Part", "Weight", "What it covers"],
    [0.3, 0.12, 0.58],
    [
      [
        "A. Goals and Impact",
        "50%",
        "The 4-5 goals agreed with your manager and the outcomes you delivered",
      ],
      ["B. Competencies and Values", "50%", "How you delivered: the 12 values listed in Part B"],
    ],
  );
  table(
    ["Rating", "What it means"],
    [0.35, 0.65],
    RATINGS.map((r) => [RATING_LABEL[r], RATING_MEANING[r]]),
  );

  heading("Part A: Goals and Impact (50%)");
  table(
    [
      "#",
      "Goal and the company priority it supports",
      "Target / measure",
      "Result achieved",
      "Evidence (numbers, links, feedback)",
      "Self-rating",
    ],
    [0.05, 0.22, 0.16, 0.2, 0.24, 0.13],
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

  heading("Part B: Competencies and Values (50%)");
  table(
    ["Value", "What it looks like in practice", "Your example from this year", "Self-rating"],
    [0.15, 0.25, 0.47, 0.13],
    VALUES.map((v) => [
      v.name,
      v.practice,
      input.form.value_answers[v.key]?.example ?? "",
      input.form.value_answers[v.key]?.rating ?? "",
    ]),
  );

  heading("Part C: Reflection");
  table(
    ["Question", "Your response"],
    [0.35, 0.65],
    REFLECTION.map((q) => [q.question, input.form.reflection[q.key] ?? ""]),
  );

  heading("Part D: Potential, Growth and Next Year");
  table(
    ["Potential question", "Your rating (Low / Moderate / High)", "Why"],
    [0.35, 0.2, 0.45],
    POTENTIAL.map((q) => [
      q.question,
      input.form.potential[q.key]?.rating ?? "",
      input.form.potential[q.key]?.why ?? "",
    ]),
  );

  heading("Sign-off");
  para("By signing, I confirm that the evidence above is accurate.");
  table(
    ["Field", ""],
    [0.32, 0.68],
    [
      ["Employee name", input.name],
      ["Signature", input.signedName ? `${input.signedName} (signed in the Team App)` : ""],
      ["Date", input.signedAt ? new Date(input.signedAt).toLocaleDateString("en-IN") : ""],
    ],
  );

  const shown = REVIEW_KINDS.flatMap((k) => input.reviews.filter((r) => r.kind === k));
  if (shown.length > 0) {
    newPage();
    heading("Ratings by Manager, HR and Admin");
    const kinds = shown.map((r) => REVIEW_LABEL[r.kind as keyof typeof REVIEW_LABEL] ?? r.kind);
    const w = 0.55 / kinds.length;
    const goals = input.form.goals.filter(
      (g) => g.goal || g.target || g.result || g.evidence || g.rating,
    );
    const cell = (x?: { rating?: string; comment?: string }) =>
      [x?.rating ?? "", x?.comment ?? ""].filter(Boolean).join(" - ");
    table(
      ["Part A goal", "Self", ...kinds],
      [0.33, 0.12, ...kinds.map(() => w)],
      goals.map((g, i) => [
        `${i + 1}. ${g.goal ?? ""}`.slice(0, 160),
        g.rating ?? "",
        ...shown.map((r) => cell(r.goal_ratings[String(i)])),
      ]),
    );
    table(
      ["Part B value", "Self", ...kinds],
      [0.33, 0.12, ...kinds.map(() => w)],
      VALUES.map((v) => [
        v.name,
        input.form.value_answers[v.key]?.rating ?? "",
        ...shown.map((r) => cell(r.value_ratings[v.key])),
      ]),
    );
    table(
      ["Reviewer", "Overall rating", "Feedback"],
      [0.18, 0.27, 0.55],
      shown.map((r) => [
        REVIEW_LABEL[r.kind as keyof typeof REVIEW_LABEL] ?? r.kind,
        rating(r.overall_rating),
        r.feedback ?? "",
      ]),
    );
    if (input.finalRating) para(`Final rating: ${rating(input.finalRating)}`, 11);
  }

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
}
