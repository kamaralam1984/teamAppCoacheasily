import { toPng } from "html-to-image";

/** The report sits on this colour in both formats. */
const PAPER = "#fffdf7";
const A4 = { width: 210, height: 297, margin: 10 };

export function goalFileName(goalName: string, day: string): string {
  const slug = goalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `coacheasily-goal-${slug || "report"}-${day}`;
}

function capture(node: HTMLElement): Promise<string> {
  return toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: PAPER });
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("The report image could not be read."));
    img.src = url;
  });
}

export async function downloadGoalImage(node: HTMLElement, fileName: string): Promise<void> {
  const a = document.createElement("a");
  a.href = await capture(node);
  a.download = `${fileName}.png`;
  a.click();
}

/** One A4 page, the whole report scaled to fit. The PDF library loads only when someone asks for one. */
export async function downloadGoalPdf(node: HTMLElement, fileName: string): Promise<void> {
  const url = await capture(node);
  const size = await imageSize(url);
  const { jsPDF } = await import("jspdf");

  const maxWidth = A4.width - A4.margin * 2;
  const maxHeight = A4.height - A4.margin * 2;
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
  const width = size.width * scale;
  const height = size.height * scale;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addImage(url, "PNG", (A4.width - width) / 2, A4.margin, width, height, undefined, "FAST");
  pdf.save(`${fileName}.pdf`);
}
