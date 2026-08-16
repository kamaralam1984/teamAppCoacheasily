import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { PulseResultsPanel } from "@/components/ideas/PulseResults";
import { useMyProfile } from "@/hooks/useMyProfile";
import {
  KIND_LABEL,
  STATUS_LABEL,
  useIdeas,
  useSetIdeaStatus,
  useVoteIdea,
  type IdeaKind,
  type IdeaRow,
  type IdeaStatus,
} from "@/hooks/useIdeas";

export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({
    meta: [
      { title: "Ideas & Improvements | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Tell us what to fix and what to build — and watch every suggestion move from new to shipped.",
      },
      { property: "og:title", content: "Ideas & Improvements | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "A shared board where every suggestion gets a status and every status change is public.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const STATUSES: IdeaStatus[] = ["new", "looking", "building", "shipped", "declined"];
const KINDS: IdeaKind[] = ["broken", "confusing", "idea", "praise"];

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: IdeaRow[]) {
  const headers = [
    "id",
    "kind",
    "title",
    "detail",
    "status",
    "status_note",
    "author",
    "is_anonymous",
    "votes",
    "screen",
    "device",
    "source",
    "created_at",
    "decided_at",
  ];
  const body = rows.map((r) =>
    [
      r.id,
      r.kind,
      r.title,
      r.detail,
      r.status,
      r.status_note,
      r.author,
      r.is_anonymous,
      r.votes,
      r.screen,
      r.device,
      r.source,
      new Date(r.created_at).toISOString(),
      r.decided_at ? new Date(r.decided_at).toISOString() : "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[headers.join(","), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `coacheasily-ideas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Page() {
  const { data } = useMyProfile();
  const role = data?.profile?.role;
  const isHr = role === "hr" || role === "admin";

  const { data: rows, isLoading } = useIdeas(Boolean(data?.profile));
  const vote = useVoteIdea();

  const [status, setStatus] = useState<IdeaStatus | "all">("all");
  const [kind, setKind] = useState<IdeaKind | "all">("all");

  const list = useMemo(() => {
    const all = rows ?? [];
    return all.filter(
      (r) => (status === "all" || r.status === status) && (kind === "all" || r.kind === kind),
    );
  }, [rows, status, kind]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <section className="ce-rise ce-card p-8">
          <h1 className="font-display text-3xl text-ink">Ideas &amp; improvements</h1>
          <p className="mt-3 max-w-lg text-sm text-soft">
            Tell us what is broken, what is slow, what would help — and what we should protect.
            Everything here gets a status, and every status change is public.
          </p>
          {isHr ? (
            <button
              type="button"
              className="btn3d btn3d-ghost mt-6 w-full sm:w-auto"
              onClick={() => downloadCsv(rows ?? [])}
              disabled={!rows || rows.length === 0}
            >
              Download CSV
            </button>
          ) : null}
        </section>

        {isHr ? <PulseResultsPanel enabled /> : null}

        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto">
            {(["all", ...STATUSES] as (IdeaStatus | "all")[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-[13px] font-bold transition ${
                  status === s
                    ? "border-goldD bg-gold/15 text-goldD"
                    : "border-line bg-ivory text-soft"
                }`}
              >
                {s === "all" ? "Everything" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(["all", ...KINDS] as (IdeaKind | "all")[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition ${
                  kind === k
                    ? "border-goldD bg-gold/15 text-goldD"
                    : "border-line bg-ivory text-soft"
                }`}
              >
                {k === "all" ? "All kinds" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-[13px] text-soft">Loading the board…</p>
        ) : list.length === 0 ? (
          <section className="ce-card p-6">
            <p className="text-[14px] text-soft">
              Nothing here yet. Use the lamp in the top bar to raise the first one.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {list.map((row, i) => (
              <IdeaCard
                key={row.id}
                row={row}
                isHr={isHr}
                onVote={() => vote.mutate(row.id)}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function IdeaCard({
  row,
  isHr,
  onVote,
  style,
}: {
  row: IdeaRow;
  isHr: boolean;
  onVote: () => void;
  style?: React.CSSProperties;
}) {
  const setStatus = useSetIdeaStatus();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<IdeaStatus>(row.status);
  const [note, setNote] = useState(row.status_note ?? "");

  const noteRequired = next === "declined" && note.trim().length === 0;

  return (
    <section className="ce-rise ce-card p-5" style={style}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ce-label">
            {KIND_LABEL[row.kind]} · {STATUS_LABEL[row.status]}
          </p>
          <h2 className="mt-1 font-display text-xl leading-snug text-ink">{row.title}</h2>
          {row.detail ? (
            <p className="mt-2 text-[13px] leading-[1.7] text-soft">{row.detail}</p>
          ) : null}
          <p className="mt-2 text-[12px] text-soft">
            {row.author} · {when(row.created_at)}
            {row.screen ? ` · from ${row.screen}` : ""}
            {row.device ? ` · ${row.device}` : ""}
          </p>
          {row.status_note ? (
            <p className="mt-3 rounded-lg border border-line bg-ivory p-3 text-[13px] text-ink">
              {row.status_note}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onVote}
          aria-pressed={row.voted}
          className={`flex min-h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg border text-[12px] font-bold transition ${
            row.voted ? "border-goldD bg-gold/15 text-goldD" : "border-line bg-ivory text-soft"
          }`}
        >
          <span aria-hidden>▲</span>
          {row.votes}
        </button>
      </div>

      {isHr ? (
        <div className="mt-4 border-t border-line pt-4">
          {open ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNext(s)}
                    className={`min-h-11 rounded-full border px-3 text-[12px] font-bold ${
                      next === s
                        ? "border-goldD bg-gold/15 text-goldD"
                        : "border-line bg-ivory text-soft"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={
                  next === "declined"
                    ? "Say why, in one line — everybody sees this"
                    : "A public note (everybody sees this)"
                }
                className="w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
              />
              {noteRequired ? (
                <p className="text-[12px] font-semibold text-goldD">
                  A "Not now" needs a reason. Declining without one is how a board like this dies.
                </p>
              ) : null}
              {setStatus.isError ? (
                <p className="text-[13px] font-semibold text-goldD">
                  That didn't go through. Please try again.
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="btn3d w-full sm:w-auto"
                  disabled={noteRequired || setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate(
                      { id: row.id, status: next, note: note.trim() },
                      { onSuccess: () => setOpen(false) },
                    )
                  }
                >
                  {setStatus.isPending ? "Saving…" : "Save status"}
                </button>
                <button
                  type="button"
                  className="btn3d btn3d-ghost w-full sm:w-auto"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn3d btn3d-ghost w-full sm:w-auto"
              onClick={() => setOpen(true)}
            >
              Move it along
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
