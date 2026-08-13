/**
 * Leadership reports.
 *
 * One rule runs through this file: a live cycle is never compared with a
 * finished one. A cycle two days old always looks worse than a closed one,
 * and holding that against a person would be dishonest.
 */

export interface AppraisalCycle {
  id: string;
  no: number;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

export interface AppraisalScore {
  pct: number;
  goals: number;
}

export interface AppraisalRow {
  profile_id: string;
  full_name: string;
  title: string | null;
  department: string | null;
  sort_order: number | null;
  scores: Record<string, AppraisalScore>;
}

export interface AppraisalData {
  cycles: AppraisalCycle[];
  rows: AppraisalRow[];
}

export interface LedgerBalance {
  type: string;
  entitled: number;
  used: number;
  pending: number;
  balance: number;
}

export interface LedgerRow {
  profile_id: string;
  full_name: string;
  title: string | null;
  department: string | null;
  balances: LedgerBalance[];
  days_worked: number;
}

export interface TeamHealth {
  warriors: number;
  present_today: number;
  on_leave_today: number;
  goals_written: number;
  avg_progress: number;
  tasks_overdue: number;
  cycle_id: string | null;
}

/* ── colour, the same everywhere ───────────────────────────── */

/** ≥90 emerald · ≥60 gold · below that red. "none" is red too. */
export function scoreTone(pct: number | null): string {
  if (pct === null) return "text-red";
  if (pct >= 90) return "text-emer";
  if (pct >= 60) return "text-goldD";
  return "text-red";
}

export function pctLabel(pct: number | null): string {
  return pct === null ? "none" : `${Math.round(pct)}%`;
}

/* ── the trend, closed cycles only ─────────────────────────── */

export interface Trend {
  /** null when there are not two closed cycles with scores to compare. */
  delta: number | null;
  latest: number | null;
  previous: number | null;
}

export function closedCycles(cycles: AppraisalCycle[]): AppraisalCycle[] {
  return cycles.filter((c) => c.status === "closed").sort((a, b) => a.no - b.no);
}

export function trendFor(row: AppraisalRow, closed: AppraisalCycle[]): Trend {
  const scored = closed
    .map((c) => ({ c, s: row.scores[c.id] ?? null }))
    .filter((x) => x.s !== null);
  if (scored.length < 2) {
    const only = scored[0]?.s?.pct ?? null;
    return { delta: null, latest: only, previous: null };
  }
  const latest = scored[scored.length - 1]!.s!.pct;
  const previous = scored[scored.length - 2]!.s!.pct;
  return { delta: Math.round((latest - previous) * 10) / 10, latest, previous };
}

/** Sort: latest CLOSED cycle score descending, people with no goals last. */
export function sortAppraisal(rows: AppraisalRow[], closed: AppraisalCycle[]): AppraisalRow[] {
  const latest = closed[closed.length - 1] ?? null;
  const key = (r: AppraisalRow): number => {
    if (latest) {
      const s = r.scores[latest.id];
      if (s) return s.pct;
    }
    return Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort((a, b) => {
    const d = key(b) - key(a);
    if (d !== 0) return d;
    return a.full_name.localeCompare(b.full_name);
  });
}

/* ── CSV, on every table ───────────────────────────────────── */

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function balanceOf(row: LedgerRow, type: string): LedgerBalance | null {
  return row.balances?.find((b) => b.type === type) ?? null;
}
