import type { ExportRow } from "@/lib/exporters";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How a report cell reads on screen: dates in words, numbers tidy, blanks as a dash. */
export function displayCell(value: ExportRow[string]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (ISO_DATE.test(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return value;
}
