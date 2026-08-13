import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import {
  CODE_VALUES,
  useDailyCodes,
  useDeleteCode,
  useSaveCode,
  type CodeValue,
  type DailyCode,
} from "@/hooks/useDailyCode";
import { useMyProfile } from "@/hooks/useMyProfile";
import { DEPARTMENTS } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/daily-codes")({
  head: () => ({
    meta: [
      { title: "Daily codes | CoachEasily Team App" },
      {
        name: "description",
        content: "The words 18 warriors read before they mark attendance each morning.",
      },
      { property: "og:title", content: "Daily codes | CoachEasily Team App" },
      {
        property: "og:description",
        content: "The words 18 warriors read before they mark attendance each morning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const BLANK = {
  day_no: 1,
  value: "Honesty" as CodeValue,
  title: "",
  body: "",
  pledge: "I'm here, and I'll work honestly today",
  department: "",
};

function Page() {
  const { data } = useMyProfile();
  const me = data?.profile ?? null;
  const allowed = me?.role === "hr" || me?.role === "admin";

  const { data: codes } = useDailyCodes(Boolean(allowed));
  const save = useSaveCode(me?.org_id ?? null);
  const remove = useDeleteCode();

  const [editing, setEditing] = useState<DailyCode | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  const start = (row: DailyCode | null) => {
    setEditing(row);
    setForm(
      row
        ? {
            day_no: row.day_no,
            value: row.value as CodeValue,
            title: row.title,
            body: row.body,
            pledge: row.pledge,
            department: row.department ?? "",
          }
        : { ...BLANK },
    );
  };

  if (!allowed) {
    return (
      <AppShell>
        <div className="ce-card p-8">
          <h1 className="font-display text-3xl text-ink">Daily codes</h1>
          <p className="mt-3 text-sm text-soft">
            Only People &amp; Culture and Admin can edit the codes.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <section className="ce-rise ce-card p-7">
          <h1 className="font-display text-3xl text-ink">Daily codes</h1>
          <p className="mt-2 max-w-xl text-sm text-soft">
            One code per day of the year. Add a department row to give a team their own words on
            the same day.
          </p>
        </section>

        <section className="ce-rise ce-card p-6">
          <h2 className="font-display text-2xl text-ink">
            {editing ? "Edit code" : "Add a code"}
          </h2>
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="dc-day" className="ce-label">
                  Day of year
                </label>
                <input
                  id="dc-day"
                  type="number"
                  min={1}
                  max={366}
                  className="ce-input"
                  value={form.day_no}
                  onChange={(e) => setForm({ ...form, day_no: Number(e.target.value) })}
                />
              </div>
              <div>
                <label htmlFor="dc-value" className="ce-label">
                  Value
                </label>
                <select
                  id="dc-value"
                  className="ce-input"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value as CodeValue })}
                >
                  {CODE_VALUES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dc-dept" className="ce-label">
                  Department
                </label>
                <select
                  id="dc-dept"
                  className="ce-input"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                >
                  <option value="">Everyone</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="dc-title" className="ce-label">
                Title
              </label>
              <input
                id="dc-title"
                className="ce-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="dc-body" className="ce-label">
                Body — two or three warm sentences
              </label>
              <textarea
                id="dc-body"
                className="ce-input min-h-28"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="dc-pledge" className="ce-label">
                Pledge — this becomes the button
              </label>
              <input
                id="dc-pledge"
                className="ce-input"
                value={form.pledge}
                onChange={(e) => setForm({ ...form, pledge: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn3d w-full sm:w-auto"
                disabled={save.isPending || !form.title.trim() || !form.body.trim()}
                onClick={() =>
                  save.mutate(
                    {
                      ...(editing ? { id: editing.id } : {}),
                      day_no: form.day_no,
                      value: form.value,
                      title: form.title,
                      body: form.body,
                      pledge: form.pledge,
                      department: form.department || null,
                    },
                    { onSuccess: () => start(null) },
                  )
                }
              >
                {save.isPending ? "Saving…" : editing ? "Save changes" : "Add code"}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="min-h-11 text-[13px] font-semibold text-soft underline-offset-4 hover:underline"
                  onClick={() => start(null)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            {save.isError ? (
              <p className="text-[13px] font-semibold text-red">
                That didn't save — there may already be a code for that day and department.
              </p>
            ) : null}
          </div>
        </section>

        <section className="ce-rise space-y-2.5">
          {(codes ?? []).map((c) => (
            <div key={c.id} className="ce-card flex gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold tracking-wider text-goldD uppercase">
                  Day {c.day_no} · {c.value}
                  {c.department ? ` · ${c.department}` : ""}
                </p>
                <p className="mt-1 font-display text-xl text-ink">{c.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-soft">{c.body}</p>
                <p className="mt-1.5 text-[13px] font-semibold text-saffBtn">{c.pledge}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-3 text-[13px] font-bold text-ink hover:bg-cream"
                  onClick={() => start(c)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-3 text-[13px] font-bold text-red hover:bg-cream"
                  onClick={() => remove.mutate(c.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
