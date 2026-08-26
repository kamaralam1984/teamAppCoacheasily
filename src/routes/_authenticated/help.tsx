import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { HELP_GROUPS, searchHelp, type HelpGroup, type HelpTopic } from "@/lib/help";


export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Help | CoachEasily Team App" },
      {
        name: "description",
        content:
          "How every part of the CoachEasily team app works — attendance, leave, goals, tasks, the calendar and more, in plain words.",
      },
      { property: "og:title", content: "Help | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "How every part of the CoachEasily team app works — attendance, leave, goals, tasks, the calendar and more, in plain words.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

function Topic({
  topic,
  open,
  highlight,
}: {
  topic: HelpTopic;
  open: boolean;
  highlight?: boolean;
}) {
  const [expanded, setExpanded] = useState(open);
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = open || expanded || Boolean(highlight);

  useEffect(() => {
    if (!highlight) return;
    setExpanded(true);
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);

  return (
    <div
      ref={ref}
      className={
        highlight
          ? "rounded-2xl bg-gold/15 px-3 ring-2 ring-goldL transition-colors"
          : "border-b border-line transition-colors last:border-0"
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-12 w-full items-center gap-3 py-3 text-left"
      >
        <span className="flex-1 text-[15px] font-semibold text-ink">{topic.title}</span>
        <ChevronDown
          size={18}
          className={isOpen ? "shrink-0 rotate-180 text-soft" : "shrink-0 text-soft"}
        />
      </button>
      {isOpen ? (
        <div className="space-y-3 pb-4">
          {topic.body.map((line, i) => (
            <p key={i} className="text-[14px] leading-relaxed text-soft">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}


function HelpPage() {
  const [q, setQ] = useState("");
  const found = useMemo(() => searchHelp(q), [q]);
  const searching = q.trim().length > 0;

  /** Arriving from a screen's "How do I use this?" — open that topic and land on it. */
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const wanted = useMemo(() => {
    const key = new URLSearchParams(searchStr.replace(/^\?/, "")).get("topic");
    return key && key.trim() ? key : null;
  }, [searchStr]);
  const [glow, setGlow] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!wanted) return;
    setGlow(wanted);
    const t = window.setTimeout(() => setGlow(null), 2600);
    return () => window.clearTimeout(t);
  }, [wanted]);

  const byGroup = useMemo(() => {
    const map = new Map<HelpGroup, HelpTopic[]>();
    for (const t of found) {
      const list = map.get(t.group) ?? [];
      list.push(t);
      map.set(t.group, list);
    }
    return map;
  }, [found]);


  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <header>
          <h1 className="font-display text-4xl text-ink">Help</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-soft">
            Everything the app does, explained in plain words. Search for what you are stuck on —
            try &ldquo;sandwich&rdquo;, &ldquo;comp off&rdquo; or &ldquo;carry forward&rdquo;.
          </p>
          <Link
            to="/dashboard"
            search={{ tour: "1" } as never}
            className="mt-3 inline-block text-sm font-semibold text-goldD underline underline-offset-4"
          >
            Take the walkthrough again →
          </Link>
        </header>

        <div className="ce-card flex items-center gap-2 px-4 py-3">
          <Search size={18} className="shrink-0 text-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help"
            aria-label="Search help"
            className="min-h-11 w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-soft"
          />
        </div>

        {found.length === 0 ? (
          <div className="ce-card p-6 text-[15px] text-soft">
            Nothing matches &ldquo;{q}&rdquo;. Try a simpler word — or raise it on the Ideas board
            and we will write it up.
          </div>
        ) : null}

        {HELP_GROUPS.filter((g) => (byGroup.get(g)?.length ?? 0) > 0).map((group) => (
          <section key={group} className="ce-card p-5">
            <h2 className="ce-label">{group}</h2>
            <div className="mt-2">
              {(byGroup.get(group) ?? []).map((t) => (
                <Topic key={t.key} topic={t} open={searching} highlight={glow === t.key} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
