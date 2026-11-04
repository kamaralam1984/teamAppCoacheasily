import { useState } from "react";
import { toast } from "sonner";

import {
  meetingLabel,
  type MeetingInput,
  type StrategicMeeting,
} from "@/hooks/useStrategicMeetings";
import { timeLabel, todayIso } from "@/lib/calendar";
import { shortDate } from "@/lib/warriors";

const EMPTY = {
  edition: "",
  title: "",
  tagline: "",
  meeting_date: "",
  from_time: "",
  to_time: "",
  location: "",
  agenda: "",
};
type Form = typeof EMPTY;

function toForm(m: StrategicMeeting): Form {
  return {
    edition: m.edition ?? "",
    title: m.title,
    tagline: m.tagline ?? "",
    meeting_date: m.meeting_date,
    from_time: m.from_time?.slice(0, 5) ?? "",
    to_time: m.to_time?.slice(0, 5) ?? "",
    location: m.location ?? "",
    agenda: m.agenda ?? "",
  };
}

function toInput(f: Form): MeetingInput {
  const t = (v: string) => v.trim() || null;
  return {
    edition: t(f.edition),
    title: f.title.trim(),
    tagline: t(f.tagline),
    meeting_date: f.meeting_date,
    from_time: f.from_time || null,
    to_time: f.to_time || null,
    location: t(f.location),
    agenda: t(f.agenda),
  };
}

/**
 * Add, change and remove strategic meetings — as many ahead as needed. The same card is used by
 * HR and admin (Admin settings) and by developers (Developer panel); each passes its own save.
 */
export function StrategicMeetingsManager({
  meetings,
  loading,
  onSave,
  onDelete,
}: {
  meetings: StrategicMeeting[];
  loading?: boolean;
  onSave: (values: MeetingInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const today = todayIso();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const upcoming = meetings.filter((m) => m.meeting_date >= today);
  const past = meetings.filter((m) => m.meeting_date < today).reverse();
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) return void toast.error("Give the meeting a name");
    if (!form.meeting_date) return void toast.error("Pick the date");
    if (form.from_time && form.to_time && form.to_time <= form.from_time) {
      return void toast.error("The end time has to be after the start time");
    }
    setBusy(true);
    try {
      await onSave(toInput(form), editingId && editingId !== "new" ? editingId : undefined);
      toast.success(editingId === "new" ? "Meeting added" : "Meeting saved");
      setEditingId(null);
      setForm(EMPTY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: StrategicMeeting) {
    if (!window.confirm(`Remove “${meetingLabel(m)}”?`)) return;
    setBusy(true);
    try {
      await onDelete(m.id);
      toast.success("Meeting removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove it");
    } finally {
      setBusy(false);
    }
  }

  const editor = (
    <div className="grid gap-2 rounded-lg border border-violet/30 bg-violet/5 p-3 sm:grid-cols-4">
      <label>
        <span className="ce-label">Number</span>
        <input
          className="ce-input"
          placeholder="5.0"
          maxLength={10}
          value={form.edition}
          onChange={(e) => set("edition", e.target.value)}
        />
      </label>
      <label className="sm:col-span-3">
        <span className="ce-label">Name</span>
        <input
          className="ce-input"
          placeholder="The Year-End Impact Summit"
          maxLength={120}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </label>
      <label className="sm:col-span-4">
        <span className="ce-label">Tagline (optional)</span>
        <input
          className="ce-input"
          placeholder="Celebrating achievements and impact"
          maxLength={160}
          value={form.tagline}
          onChange={(e) => set("tagline", e.target.value)}
        />
      </label>
      <label>
        <span className="ce-label">Date</span>
        <input
          type="date"
          className="ce-input"
          value={form.meeting_date}
          onChange={(e) => set("meeting_date", e.target.value)}
        />
      </label>
      <label>
        <span className="ce-label">From</span>
        <input
          type="time"
          className="ce-input"
          value={form.from_time}
          onChange={(e) => set("from_time", e.target.value)}
        />
      </label>
      <label>
        <span className="ce-label">To</span>
        <input
          type="time"
          className="ce-input"
          value={form.to_time}
          onChange={(e) => set("to_time", e.target.value)}
        />
      </label>
      <label>
        <span className="ce-label">Place</span>
        <input
          className="ce-input"
          placeholder="Office / Online"
          maxLength={120}
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
        />
      </label>
      <label className="sm:col-span-4">
        <span className="ce-label">Agenda (optional)</span>
        <textarea
          className="ce-input min-h-[72px] py-2"
          maxLength={2000}
          value={form.agenda}
          onChange={(e) => set("agenda", e.target.value)}
        />
      </label>
      <div className="flex gap-2 sm:col-span-4">
        <button type="button" className="btn3d" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : editingId === "new" ? "Add meeting" : "Save"}
        </button>
        <button
          type="button"
          className="btn3d btn3d-ghost"
          disabled={busy}
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const row = (m: StrategicMeeting) =>
    editingId === m.id ? (
      <li key={m.id}>{editor}</li>
    ) : (
      <li
        key={m.id}
        className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-white px-3 py-2.5"
      >
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-violet" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{meetingLabel(m)}</p>
          {m.tagline ? <p className="text-[12px] text-ink/80 italic">{m.tagline}</p> : null}
          <p className="text-[12px] text-soft">
            {[
              shortDate(m.meeting_date),
              m.from_time
                ? `${timeLabel(m.from_time)}${m.to_time ? ` – ${timeLabel(m.to_time)}` : ""}`
                : null,
              m.location,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-bold text-ink"
          disabled={busy || editingId !== null}
          onClick={() => {
            setEditingId(m.id);
            setForm(toForm(m));
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-bold text-red"
          disabled={busy || editingId !== null}
          onClick={() => void remove(m)}
        >
          Remove
        </button>
      </li>
    );

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Strategic meetings</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        Set as many meetings ahead as you like. Each shows on everyone's calendar, and the whole
        team is reminded 7 days and 1 day before.
      </p>

      {loading ? <p className="mt-4 text-sm text-soft">Loading…</p> : null}

      {upcoming.length > 0 ? (
        <ul className="mt-4 space-y-2">{upcoming.map(row)}</ul>
      ) : !loading ? (
        <p className="mt-4 text-sm text-soft">No meeting coming up yet.</p>
      ) : null}

      <div className="mt-3">
        {editingId === "new" ? (
          editor
        ) : (
          <button
            type="button"
            className="btn3d btn3d-gold"
            disabled={editingId !== null}
            onClick={() => {
              setEditingId("new");
              setForm(EMPTY);
            }}
          >
            + Add a strategic meeting
          </button>
        )}
      </div>

      {past.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            className="text-[13px] font-bold text-soft underline"
            onClick={() => setShowPast((v) => !v)}
          >
            {showPast ? "Hide" : "Show"} past meetings ({past.length})
          </button>
          {showPast ? <ul className="mt-2 space-y-2">{past.map(row)}</ul> : null}
        </div>
      ) : null}
    </section>
  );
}
