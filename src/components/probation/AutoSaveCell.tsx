import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** How long a cell waits after the last key before it saves by itself. */
export const AUTOSAVE_MS = 1000;

/**
 * The page's unsaved cells: each cell registers how to save itself now, and says when it holds
 * typing that has not been sent yet, so the Save button, leaving the page and the status line
 * all see the same thing.
 */
export type Drafts = {
  register: (flush: () => void) => () => void;
  setDirty: (key: object, dirty: boolean) => void;
};
export const DraftsContext = createContext<Drafts | null>(null);

/**
 * A cell you can type in. It saves by itself a moment after you stop typing, when you leave it,
 * when its table goes away (another person) and when the page is hidden or
 * closed; only if it changed. Typing is never overwritten by a reload of the table.
 */
export function Cell({
  value,
  onSave,
  placeholder,
  type = "text",
  multiline = false,
  rows = 2,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  multiline?: boolean;
  rows?: number;
  className?: string;
}) {
  const drafts = useContext(DraftsContext);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const sent = useRef(value); // the value last saved, or last loaded
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [key] = useState(() => ({}));

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const v = draftRef.current;
    if (v !== sent.current) {
      sent.current = v;
      onSaveRef.current(v);
    }
    drafts?.setDirty(key, false);
  }, [drafts, key]);

  // take the saved value from the server, but never over typing that is in progress
  useEffect(() => {
    if (focused.current || draftRef.current !== sent.current) return;
    sent.current = value;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  // save what is left when the cell goes away
  useEffect(() => {
    const off = drafts?.register(flush);
    return () => {
      off?.();
      flush();
    };
  }, [drafts, flush]);

  const change = (v: string) => {
    setDraft(v);
    draftRef.current = v;
    drafts?.setDirty(key, v !== sent.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  };
  const focus = () => {
    focused.current = true;
  };
  const blur = () => {
    focused.current = false;
    flush();
  };

  const base = `w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-ink hover:border-line focus:border-gold focus:bg-white focus:outline-none ${className}`;
  return multiline ? (
    <textarea
      rows={rows}
      className={`${base} min-h-[52px] resize-y`}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => change(e.target.value)}
      onFocus={focus}
      onBlur={blur}
    />
  ) : (
    <input
      type={type}
      className={base}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => change(e.target.value)}
      onFocus={focus}
      onBlur={blur}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
