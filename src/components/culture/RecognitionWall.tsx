import { useMemo, useState } from "react";

import { useGiveRecognition } from "@/hooks/useCulture";
import { BADGES, joinedLabel, shelfOrder, tenureLabel, whenLabel, type Recognition } from "@/lib/culture";
import { ACCESS_LEVELS, daysSince, isNewWarrior, type Profile } from "@/lib/warriors";
import { WarriorAvatar } from "@/components/warriors/Avatar";


export function GiveRecognition({
  me,
  people,
  canBadge,
}: {
  me: Profile;
  people: Profile[];
  canBadge: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"praise" | "badge">("praise");
  const [toId, setToId] = useState("");
  const [badge, setBadge] = useState<string>(BADGES[0]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const give = useGiveRecognition(me.org_id, me.id);

  const others = useMemo(
    () => people.filter((p) => p.id !== me.id && p.status === "active"),
    [people, me.id],
  );

  if (!open) {
    return (
      <button type="button" className="btn3d w-full sm:w-auto" onClick={() => setOpen(true)}>
        Appreciate someone
      </button>
    );
  }

  return (
    <form
      className="ce-card space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!toId) return setError("Choose the person first.");
        if (!text.trim()) return setError("Say what they did — specifics land harder.");
        give.mutate(
          { to_id: toId, kind, badge_name: badge, text },
          {
            onSuccess: () => {
              setOpen(false);
              setText("");
              setToId("");
              setKind("praise");
            },
            onError: (e2) => setError((e2 as Error).message),
          },
        );
      }}
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setKind("praise")}
          className={`min-h-11 rounded-full border px-4 text-[13px] font-bold ${
            kind === "praise" ? "border-goldD bg-gold/15 text-goldD" : "border-line text-soft"
          }`}
        >
          Appreciation
        </button>
        {canBadge ? (
          <button
            type="button"
            onClick={() => setKind("badge")}
            className={`min-h-11 rounded-full border px-4 text-[13px] font-bold ${
              kind === "badge" ? "border-goldD bg-gold/15 text-goldD" : "border-line text-soft"
            }`}
          >
            Award a badge
          </button>
        ) : null}
      </div>

      <label className="block">
        <span className="ce-label">To</span>
        <select
          className="mt-1 min-h-12 w-full rounded-lg border border-line bg-ivory px-3 text-[15px] text-ink"
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        >
          <option value="">Choose a warrior…</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </label>

      {kind === "badge" ? (
        <label className="block">
          <span className="ce-label">Badge</span>
          <select
            className="mt-1 min-h-12 w-full rounded-lg border border-line bg-ivory px-3 text-[15px] text-ink"
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
          >
            {BADGES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[12px] text-soft">
            A badge is announced to the whole company.
          </span>
        </label>
      ) : null}

      <label className="block">
        <span className="ce-label">What they did</span>
        <textarea
          className="mt-1 min-h-24 w-full rounded-lg border border-line bg-ivory p-3 text-[15px] text-ink"
          placeholder="Be specific — “stayed back to fix the batch list before Monday” beats “great work”."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      {error ? <p className="text-[13px] font-bold text-red">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className="btn3d flex-1" disabled={give.isPending}>
          {give.isPending ? "Sending…" : kind === "badge" ? "Award it" : "Send it"}
        </button>
        <button
          type="button"
          className="min-h-12 flex-1 rounded-lg border border-line bg-ivory text-[14px] font-bold text-soft"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RecognitionCard({
  row,
  people,
  style,
}: {
  row: Recognition;
  people: Profile[];
  style?: React.CSSProperties;
}) {
  const to = people.find((p) => p.id === row.to_id);
  const from = people.find((p) => p.id === row.from_id);

  return (
    <article className="ce-rise ce-card p-5" style={style}>
      <div className="flex items-start gap-3">
        <WarriorAvatar
          name={to?.full_name ?? "?"}
          size={40}
          path={to?.avatar_url ?? null}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-tight font-bold text-ink">
            {to?.full_name ?? "A warrior"}
          </p>
          {row.kind === "welcome" && to ? (
            <p className="text-[13px] leading-snug font-semibold text-goldD">
              {to.title?.trim() || "Post not set"}
              {to.department ? ` · ${to.department}` : ""}
            </p>
          ) : null}
          <p className="text-[12px] text-soft">
            {row.kind === "welcome"
              ? "joined CoachEasily"
              : `from ${from?.full_name ?? "a teammate"}`}{" "}
            · {row.kind === "welcome" ? joinedLabel(to?.joined_on, row.created_at) : whenLabel(row.created_at)}
          </p>
        </div>
      </div>

      {row.kind === "badge" && row.badge_name ? (
        <span className="mt-3 inline-block rounded-full border border-gold bg-gold/15 px-3 py-1 text-[12px] font-bold text-goldD">
          🏅 {row.badge_name}
        </span>
      ) : null}
      {row.kind === "welcome" && to ? (
        <span className="mt-3 mr-2 inline-block rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-[12px] font-bold text-goldD">
          {ACCESS_LEVELS.find((a) => a.value === to.role)?.label ?? "Warrior"}
        </span>
      ) : null}
      {row.kind === "welcome" && to && isNewWarrior(to) ? (
        <span className="mt-3 inline-block rounded-full border border-emer/40 bg-emer/10 px-3 py-1 text-[12px] font-bold text-emer">
          👋 New warrior
        </span>
      ) : null}
      {row.kind === "welcome" && to && !isNewWarrior(to) && tenureLabel(daysSince(to.joined_on)) ? (
        <span className="mt-3 inline-block rounded-full border border-line bg-cream px-3 py-1 text-[12px] font-bold text-soft">
          {tenureLabel(daysSince(to.joined_on))}
        </span>
      ) : null}

      <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line text-ink">{row.text}</p>
    </article>
  );
}

export function MyShelf({
  rows,
  people,
  meId,
}: {
  rows: Recognition[];
  people: Profile[];
  meId: string;
}) {
  const mine = useMemo(
    () => shelfOrder(rows.filter((r) => r.to_id === meId)),
    [rows, meId],
  );
  const badges = mine.filter((r) => r.kind === "badge");
  const praise = mine.filter((r) => r.kind === "praise");

  return (
    <section className="ce-rise ce-card p-6">
      <p className="ce-label">My shelf</p>
      <h2 className="mt-1 font-display text-2xl text-ink">
        {mine.length === 0
          ? "Nothing on the shelf yet"
          : `${badges.length} badge${badges.length === 1 ? "" : "s"} · ${praise.length} kind word${
              praise.length === 1 ? "" : "s"
            }`}
      </h2>
      <p className="mt-1 text-[13px] text-soft">
        Everything you have ever been given stays here. It does not scroll away.
      </p>

      <div className="mt-4 space-y-3">
        {mine.length === 0 ? (
          <p className="text-[13px] text-soft">
            It will fill up. In the meantime, the fastest way to be appreciated is to appreciate
            someone else.
          </p>
        ) : (
          mine.map((r) => (
            <div key={r.id} className="rounded-[14px] border border-line bg-cream p-4">
              {r.kind === "badge" && r.badge_name ? (
                <span className="mb-2 inline-block rounded-full border border-gold bg-gold/15 px-3 py-1 text-[12px] font-bold text-goldD">
                  🏅 {r.badge_name}
                </span>
              ) : null}
              <p className="text-[14px] leading-relaxed whitespace-pre-line text-ink">{r.text}</p>
              <p className="mt-1 text-[12px] text-soft">
                {r.kind === "welcome"
                  ? "The day you joined"
                  : (people.find((p) => p.id === r.from_id)?.full_name ?? "A teammate")}{" "}
                ·{" "}
                {r.kind === "welcome"
                  ? joinedLabel(people.find((p) => p.id === r.to_id)?.joined_on, r.created_at)
                  : whenLabel(r.created_at)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
