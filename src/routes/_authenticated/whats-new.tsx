import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useIdeas } from "@/hooks/useIdeas";
import {
  useAllReleases,
  usePublishRelease,
  useReleaseHistory,
  useReleaseItems,
  useSaveRelease,
  type EditableItem,
} from "@/hooks/useReleases";

export const Route = createFileRoute("/_authenticated/whats-new")({
  head: () => ({
    meta: [
      { title: "What's new | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Every change we have shipped in the team app — what it does, how to use it and who asked for it.",
      },
      { property: "og:title", content: "What's new | CoachEasily Team App" },
      {
        property: "og:description",
        content: "A running record of what changed in the app, and who suggested it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function blankItem(order: number): EditableItem {
  return {
    sort_order: order,
    title: "",
    what_it_does: "",
    how_to_use: "",
    why_it_helps: "",
    idea_id: null,
  };
}

function Page() {
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;
  const isHr = profile?.role === "hr" || profile?.role === "admin";

  const { data: history, isLoading } = useReleaseHistory(Boolean(profile));

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <section className="ce-rise ce-card p-8">
          <h1 className="font-display text-3xl text-ink">What's new</h1>
          <p className="mt-3 max-w-lg text-sm text-soft">
            Everything we have shipped, newest first — what it does, how to use it, and who asked
            for it.
          </p>
        </section>

        {isHr ? <Composer /> : null}

        {isLoading ? (
          <p className="text-[13px] text-soft">Loading…</p>
        ) : (history ?? []).length === 0 ? (
          <section className="ce-card p-6">
            <p className="text-[14px] text-soft">Nothing published yet.</p>
          </section>
        ) : (
          (history ?? []).map((rel, i) => (
            <section
              key={rel.id}
              className="ce-rise ce-card p-6"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <p className="ce-label">{when(rel.published_at)}</p>
              <h2 className="mt-1 font-display text-2xl leading-snug text-ink">{rel.title}</h2>
              {rel.summary ? (
                <p className="mt-2 text-[14px] leading-[1.7] text-soft">{rel.summary}</p>
              ) : null}
              <div className="mt-4 space-y-4">
                {rel.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-line bg-ivory p-4">
                    <h3 className="font-display text-lg leading-snug text-ink">{item.title}</h3>
                    {item.what_it_does ? (
                      <p className="mt-2 text-[13px] leading-[1.7] text-soft">
                        {item.what_it_does}
                      </p>
                    ) : null}
                    {item.how_to_use ? (
                      <p className="mt-2 text-[13px] leading-[1.7] text-ink">
                        <span className="font-bold">How to use it — </span>
                        {item.how_to_use}
                      </p>
                    ) : null}
                    {item.why_it_helps ? (
                      <p className="mt-2 text-[13px] leading-[1.7] text-soft">
                        <span className="font-bold text-ink">Why it helps — </span>
                        {item.why_it_helps}
                      </p>
                    ) : null}
                    {item.credit ? (
                      <p className="mt-3 text-[12px] font-bold text-goldD">
                        Suggested by {item.credit}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}

function Composer() {
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;

  const { data: drafts } = useAllReleases(Boolean(profile));
  const { data: ideas } = useIdeas(Boolean(profile));
  const shipped = useMemo(() => (ideas ?? []).filter((i) => i.status === "shipped"), [ideas]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: loadedItems } = useReleaseItems(editingId);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [items, setItems] = useState<EditableItem[]>([blankItem(0)]);

  useEffect(() => {
    if (!editingId) return;
    const row = (drafts ?? []).find((d) => d.id === editingId);
    if (row) {
      setTitle(row.title);
      setSummary(row.summary ?? "");
    }
  }, [editingId, drafts]);

  useEffect(() => {
    if (editingId && loadedItems) {
      setItems(loadedItems.length > 0 ? loadedItems : [blankItem(0)]);
    }
  }, [editingId, loadedItems]);

  const save = useSaveRelease(profile?.org_id ?? null, profile?.id ?? null);
  const publish = usePublishRelease();

  function reset() {
    setEditingId(null);
    setTitle("");
    setSummary("");
    setItems([blankItem(0)]);
  }

  function patch(index: number, next: Partial<EditableItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...next } : it)));
  }

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(to, 0, row!);
      return copy;
    });
  }

  const canSave = title.trim().length > 0 && items.some((i) => i.title.trim().length > 0);

  return (
    <section className="ce-card space-y-4 p-6">
      <h2 className="font-display text-2xl text-ink">
        {editingId ? "Edit release" : "New release"}
      </h2>

      {(drafts ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className={`min-h-11 rounded-full border px-3 text-[12px] font-bold ${
              editingId === null
                ? "border-goldD bg-gold/15 text-goldD"
                : "border-line bg-ivory text-soft"
            }`}
          >
            New
          </button>
          {(drafts ?? []).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setEditingId(d.id)}
              className={`min-h-11 rounded-full border px-3 text-[12px] font-bold ${
                editingId === d.id
                  ? "border-goldD bg-gold/15 text-goldD"
                  : "border-line bg-ivory text-soft"
              }`}
            >
              {d.title} {d.published ? "· published" : "· draft"}
            </button>
          ))}
        </div>
      ) : null}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Release title"
        className="w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder="A line or two on what this release is about"
        className="w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
      />

      <div className="space-y-4">
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="ce-label">Item {i + 1}</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Move up"
                  className="min-h-11 min-w-11 rounded-lg border border-line text-soft"
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className="min-h-11 min-w-11 rounded-lg border border-line text-soft"
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Remove item"
                  className="min-h-11 min-w-11 rounded-lg border border-line text-soft"
                  onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, x) => x !== i) : p))}
                >
                  ✕
                </button>
              </div>
            </div>
            <input
              value={it.title}
              onChange={(e) => patch(i, { title: e.target.value })}
              placeholder="What we shipped"
              className="w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
            />
            <textarea
              value={it.what_it_does}
              onChange={(e) => patch(i, { what_it_does: e.target.value })}
              rows={2}
              placeholder="What it does"
              className="w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
            />
            <textarea
              value={it.how_to_use}
              onChange={(e) => patch(i, { how_to_use: e.target.value })}
              rows={2}
              placeholder="How to use it"
              className="w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
            />
            <textarea
              value={it.why_it_helps}
              onChange={(e) => patch(i, { why_it_helps: e.target.value })}
              rows={2}
              placeholder="Why it helps"
              className="w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
            />
            <select
              value={it.idea_id ?? ""}
              onChange={(e) => patch(i, { idea_id: e.target.value || null })}
              className="min-h-11 w-full rounded-lg border border-line bg-ivory p-3 text-[14px] text-ink"
            >
              <option value="">Credit a shipped idea (optional)</option>
              {shipped.map((idea) => (
                <option key={idea.id} value={idea.id}>
                  {idea.title} — {idea.is_anonymous ? "Anonymous" : idea.author}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          className="btn3d btn3d-ghost w-full sm:w-auto"
          onClick={() => setItems((p) => [...p, blankItem(p.length)])}
        >
          Add another item
        </button>
      </div>

      {save.isError || publish.isError ? (
        <p className="text-[13px] font-semibold text-goldD">
          That didn't go through. Please try again.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn3d btn3d-ghost w-full sm:w-auto"
          disabled={!canSave || save.isPending}
          onClick={() =>
            save.mutate(
              {
                id: editingId,
                title: title.trim(),
                summary: summary.trim(),
                items: items.filter((i) => i.title.trim().length > 0),
              },
              { onSuccess: (id) => setEditingId(id) },
            )
          }
        >
          {save.isPending ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          className="btn3d w-full sm:w-auto"
          disabled={!canSave || save.isPending || publish.isPending}
          onClick={() =>
            save.mutate(
              {
                id: editingId,
                title: title.trim(),
                summary: summary.trim(),
                items: items.filter((i) => i.title.trim().length > 0),
              },
              {
                onSuccess: (id) => {
                  publish.mutate(id, {
                    onSuccess: () => {
                      toast.success("Published. Everybody will see it.");
                      reset();
                    },
                  });
                },
              },
            )
          }
        >
          {publish.isPending ? "Publishing…" : "Publish to everybody"}
        </button>
      </div>
    </section>
  );
}
