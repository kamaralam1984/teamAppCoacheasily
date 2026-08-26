import { useMemo, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

import { FilePicker } from "@/components/FilePicker";
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
  similarIdeas,
  uploadIdeaScreenshot,
  useIdeas,
  useSubmitIdea,
  useVoteIdea,
  type IdeaKind,
} from "@/hooks/useIdeas";

const KINDS: [IdeaKind, string][] = [
  ["broken", "Something's broken"],
  ["confusing", "This is confusing or slow"],
  ["idea", "I have an idea"],
  ["praise", "This is good, don't change it"],
];

function screenName(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
}

export function SubmitIdea({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Share an idea or a problem"
        title="Ideas & improvements"
        onClick={() => setOpen(true)}
        disabled={!enabled}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-mist transition-colors hover:bg-night2 hover:text-goldL disabled:opacity-40"
      >
        <Lightbulb size={20} />
      </button>
      {open ? <Sheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Sheet({ onClose }: { onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: board } = useIdeas(true);
  const submit = useSubmitIdea();
  const vote = useVoteIdea();

  const [kind, setKind] = useState<IdeaKind>("idea");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [done, setDone] = useState(false);
  const [shot, setShot] = useState<File | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shotFailed, setShotFailed] = useState(false);

  const device =
    typeof window !== "undefined" && window.innerWidth < 640 ? "Phone" : "Computer";
  const screen = screenName(pathname);

  const dupes = useMemo(
    () => (title.trim().length >= 4 ? similarIdeas(board ?? [], title) : []),
    [board, title],
  );

  function pick(file: File | null) {
    setShotFailed(false);
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    setShot(file);
    setShotUrl(file ? URL.createObjectURL(file) : null);
  }

  async function send() {
    if (!title.trim()) return;
    let path: string | null = null;
    if (shot) {
      setUploading(true);
      path = await uploadIdeaScreenshot(shot);
      setUploading(false);
      // an upload that fails must never cost somebody what they typed
      if (!path) setShotFailed(true);
    }
    submit.mutate(
      {
        kind,
        title: title.trim(),
        detail: detail.trim(),
        anonymous,
        screen,
        device,
        screenshotPath: path,
      },
      { onSuccess: () => setDone(true) },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 p-0 sm:items-center sm:p-4">
      <div className="ce-card max-h-[92vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ce-label">Ideas &amp; improvements</p>
            <h2 className="mt-1 font-display text-2xl text-ink">
              {done ? "Thank you — it's on the board" : "Tell us what to fix or build"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-soft hover:bg-ivory"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-soft">
              Everyone can see it now, and you'll see the status change on the Ideas tab.
            </p>
            <button type="button" className="btn3d w-full" onClick={onClose}>
              Back to work
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {KINDS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key)}
                  className={`min-h-11 rounded-lg border px-3 text-left text-[13px] font-bold transition ${
                    kind === key
                      ? "border-goldD bg-gold/15 text-goldD"
                      : "border-line bg-ivory text-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="One line — what is it?"
              className="min-h-11 w-full rounded-lg border border-line bg-ivory px-3 text-[15px] text-ink"
            />

            {dupes.length > 0 ? (
              <div className="rounded-lg border border-line bg-ivory p-3">
                <p className="text-[12px] font-bold text-soft">
                  Already raised — add your vote instead?
                </p>
                <ul className="mt-2 space-y-2">
                  {dupes.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-ink">{d.title}</span>
                      <button
                        type="button"
                        onClick={() => vote.mutate(d.id)}
                        className="min-h-9 shrink-0 rounded-full border border-goldD px-3 text-[12px] font-bold text-goldD"
                      >
                        {d.voted ? `Voted · ${d.votes}` : `Vote · ${d.votes}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder="Anything more we should know (optional)"
              className="w-full rounded-lg border border-line bg-ivory p-3 text-[15px] text-ink"
            />

            <div className="rounded-lg border border-line bg-ivory p-3">
              <p className="text-[13px] font-bold text-ink">Add a screenshot (optional)</p>
              <p className="mt-0.5 text-[12px] text-soft">
                It helps us see exactly what you are seeing.
              </p>
              <div className="mt-2">
                <FilePicker
                  label="Add a screenshot"
                  accept={SCREENSHOT_TYPES.join(",")}
                  maxBytes={SCREENSHOT_MAX_BYTES}
                  uploading={uploading}
                  hint="PNG, JPG or WEBP, up to 5MB."
                  onSelect={(f) => pick(f)}
                />
              </div>
              {shotFailed ? (
                <p className="mt-2 text-[12px] font-semibold text-goldD">
                  The picture would not upload — we sent your words through anyway.
                </p>
              ) : null}
            </div>


            <label className="flex items-start gap-3 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                Send this anonymously
                {anonymous ? (
                  <span className="mt-1 block text-[12px] text-soft">
                    We will not know who sent it — so we cannot credit you, and we cannot tell you
                    when it ships.
                  </span>
                ) : null}
              </span>
            </label>

            <p className="text-[12px] text-soft">
              From: {screen} · {device}
            </p>

            {submit.isError ? (
              <p className="text-[13px] font-semibold text-goldD">
                That didn't go through. Please try again.
              </p>
            ) : null}

            <button
              type="button"
              className="btn3d w-full"
              onClick={() => void send()}
              disabled={submit.isPending || uploading || !title.trim()}
            >
              {uploading ? "Uploading…" : submit.isPending ? "Sending…" : "Send it"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SubmitIdea;
