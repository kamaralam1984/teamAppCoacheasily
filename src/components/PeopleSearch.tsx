import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WarriorAvatar } from "@/components/warriors/Avatar";
import { useWarriors } from "@/hooks/useWarriors";
import { searchPeople, type PersonMatch } from "@/lib/peopleSearch";

/** The magnifier in the top bar. Opens with a click, or with "/" or Ctrl/Cmd+K. */
export function PeopleSearch({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { data: people } = useWarriors();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  const results = useMemo(() => searchPeople(people ?? [], query), [people, query]);

  function go(match: PersonMatch | undefined) {
    if (!match) return;
    setOpen(false);
    setQuery("");
    void navigate({ to: "/people/$profileId", params: { profileId: match.person.id } });
  }

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Search people"
        title="Search people ( / )"
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-mist transition-colors hover:bg-night2 hover:text-goldL"
      >
        <Search size={18} />
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setQuery("");
            setActive(0);
          }
        }}
      >
        <DialogContent
          className="max-w-lg"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Find someone</DialogTitle>
          </DialogHeader>
          <input
            ref={inputRef}
            className="ce-input"
            placeholder="Name, employee id, department, title or manager"
            aria-label="Search people"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[active]);
              }
            }}
          />
          <ul className="max-h-80 space-y-1 overflow-y-auto" role="listbox" aria-label="Results">
            {results.map((m, i) => (
              <li key={m.person.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left ${
                    i === active ? "bg-cream" : "hover:bg-cream/60"
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(m)}
                >
                  <WarriorAvatar name={m.person.full_name} size={36} src={m.person.avatar_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {m.person.full_name}
                      {m.person.employee_code ? (
                        <span className="ml-2 text-[12px] font-normal text-soft">
                          {m.person.employee_code}
                        </span>
                      ) : null}
                      {m.person.status === "exited" ? (
                        <span className="ml-2 text-[11px] font-bold text-red">exited</span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[12px] text-soft">
                      {[m.person.title, m.person.department].filter(Boolean).join(" · ")}
                      {m.managerName ? ` · reports to ${m.managerName}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {query.trim() && results.length === 0 ? (
              <li className="px-2 py-3 text-sm text-soft">Nobody matches “{query}”.</li>
            ) : null}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
