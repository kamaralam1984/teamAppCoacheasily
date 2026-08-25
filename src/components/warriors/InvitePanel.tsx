import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inviteWarrior } from "@/lib/invite.functions";
import { listLoginStatus, type LoginStatus } from "@/lib/loginStatus.functions";
import type { Profile, TreeNode } from "@/lib/warriors";

export function useLoginStatus(enabled: boolean) {
  const list = useServerFn(listLoginStatus);
  return useQuery({
    queryKey: ["login-status"],
    enabled,
    retry: false,
    queryFn: async () => (await list({})).rows,
    select: (rows: LoginStatus[]) => new Map(rows.map((r) => [r.profile_id, r])),
  });
}

/** Org-chart order, flattened. */
export function flattenTree(tree: TreeNode[]): Profile[] {
  const out: Profile[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n.profile);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

function guessEmail(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const clean = first.toLowerCase().replace(/[^a-z]/g, "");
  return clean ? `${clean}@coacheasily.com` : "";
}

function statusChip(s: LoginStatus | undefined) {
  if (!s || !s.has_login)
    return { text: "No login yet", cls: "bg-line text-soft" };
  if (s.accepted_at) return { text: "Signed in", cls: "bg-gold/15 text-goldD" };
  return { text: "Invite sent", cls: "bg-saff/12 text-saffBtn" };
}

/**
 * People & Culture runs the invites from here. Nothing is sent until the
 * person presses the button — one at a time, or all the pending ones at once.
 */
export function InvitePanel({
  tree,
  statuses,
  only,
  onClose,
}: {
  tree: TreeNode[];
  statuses: Map<string, LoginStatus> | undefined;
  /** open focused on a single warrior */
  only?: Profile | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const invite = useServerFn(inviteWarrior);

  const people = useMemo(() => {
    const flat = flattenTree(tree).filter((p) => p.status === "active");
    const order = new Map(flat.map((p, i) => [p.id, i]));
    if (only) return flat.filter((p) => p.id === only.id);
    return [...flat].sort((a, b) => {
      const aHas = statuses?.get(a.id)?.has_login ? 1 : 0;
      const bHas = statuses?.get(b.id)?.has_login ? 1 : 0;
      if (aHas !== bHas) return aHas - bHas;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  }, [tree, statuses, only]);

  const [emails, setEmails] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [copied, setCopied] = useState(false);


  useEffect(() => {
    setEmails((prev) => {
      const next = { ...prev };
      for (const p of people) {
        if (next[p.id] === undefined) {
          // Never guess an address — a wrong one burns a real login against the profile.
          next[p.id] = statuses?.get(p.id)?.email ?? p.email ?? "";
        }
      }
      return next;
    });
  }, [people, statuses]);


  const validEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

  const pending = people.filter((p) => !statuses?.get(p.id)?.has_login && !sent[p.id]);
  const ready = pending.filter((p) => validEmail(emails[p.id] ?? ""));


  const sendOne = async (p: Profile) => {
    const email = (emails[p.id] ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFailed((f) => ({ ...f, [p.id]: "That email doesn't look right." }));
      return;
    }
    setFailed((f) => ({ ...f, [p.id]: "" }));
    try {
      await invite({
        data: {
          profileId: p.id,
          email,
          redirectTo: `${window.location.origin}/change-password`,
        },
      });
      setSent((s) => ({ ...s, [p.id]: email }));
    } catch (e) {
      setFailed((f) => ({ ...f, [p.id]: (e as Error).message }));
    }
  };

  const one = useMutation({ mutationFn: sendOne, onSettled: () => refresh() });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["login-status"] });
    void qc.invalidateQueries({ queryKey: ["warriors"] });
  };

  const sendAll = async () => {
    setRunning(true);
    for (const p of ready) {
      // eslint-disable-next-line no-await-in-loop
      await sendOne(p);
    }
    setRunning(false);
    setConfirmAll(false);
    refresh();
  };

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-ink/45 px-3 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Invites"
    >
      <div className="ce-card mx-auto w-full max-w-2xl p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-ink">
              {only ? `Invite ${only.full_name}` : "Logins & invites"}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-soft">
              An invite creates their login against this same profile — never a second one — and
              emails them to set their own password. Nothing goes out until you press send.
            </p>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-[12px] border border-line bg-white p-3.5 sm:flex-row sm:items-center">
          <p className="flex-1 text-[13px] leading-relaxed text-soft">
            Anyone whose work email is on their profile can set their own password themselves —
            send them this link on WhatsApp.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-ink hover:bg-cream"
            onClick={() => {
              const link = `${window.location.origin}/join`;
              void navigator.clipboard?.writeText(link);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Link copied" : "Copy join link"}
          </button>
        </div>

        {!only ? (

          <div className="mt-4 rounded-[12px] border border-line bg-pearl p-3.5">
            {confirmAll ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="flex-1 text-[13px] font-semibold text-ink">
                  Send {ready.length} invite{ready.length === 1 ? "" : "s"} now? Each person gets
                  an email straight away.
                </p>
                <button
                  type="button"
                  className="btn3d min-h-11"
                  disabled={running || ready.length === 0}
                  onClick={() => void sendAll()}
                >
                  {running ? "Sending…" : "Yes, send them"}
                </button>
                <button
                  type="button"
                  className="min-h-11 text-[13px] font-semibold text-soft underline-offset-4 hover:underline"
                  onClick={() => setConfirmAll(false)}
                >
                  Not yet
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn3d min-h-11 w-full sm:w-auto"
                disabled={ready.length === 0}
                onClick={() => setConfirmAll(true)}
              >
                {pending.length === 0
                  ? "Everyone has a login"
                  : ready.length === 0
                    ? "Type an email to invite"
                    : `Invite everyone with an email typed in (${ready.length})`}
              </button>
            )}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {people.map((p) => {
            const s = statuses?.get(p.id);
            const chip = sent[p.id]
              ? { text: "Invite sent", cls: "bg-saff/12 text-saffBtn" }
              : statusChip(s);
            const done = Boolean(s?.has_login) || Boolean(sent[p.id]);
            return (
              <div key={p.id} className="rounded-[12px] border border-line bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-ink">{p.full_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${chip.cls}`}
                  >
                    {chip.text}
                  </span>
                  {s?.accepted_at ? (
                    <span className="text-[12px] text-soft">
                      accepted {new Date(s.accepted_at).toLocaleDateString("en-GB")}
                    </span>
                  ) : s?.invited_at ? (
                    <span className="text-[12px] text-soft">
                      invited {new Date(s.invited_at).toLocaleDateString("en-GB")} · not accepted yet
                    </span>
                  ) : null}
                </div>

                {done ? (
                  <p className="mt-1.5 text-[13px] text-soft">
                    {sent[p.id] ?? s?.email ?? "Login linked."}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      className="ce-input flex-1"
                      type="email"
                      aria-label={`Work email for ${p.full_name}`}
                      placeholder={guessEmail(p.full_name) || "name@example.com"}
                      value={emails[p.id] ?? ""}
                      onChange={(e) => setEmails((m) => ({ ...m, [p.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn3d min-h-11"
                      disabled={one.isPending || running || !validEmail(emails[p.id] ?? "")}
                      onClick={() => one.mutate(p)}
                    >
                      {one.isPending && one.variables?.id === p.id ? "Sending…" : "Invite"}
                    </button>
                  </div>
                )}

                {failed[p.id] ? (
                  <p className="mt-2 text-[13px] font-semibold text-red">{failed[p.id]}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
