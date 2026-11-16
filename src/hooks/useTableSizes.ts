import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** Narrowest column and lowest row a drag can make. */
export const MIN_COL = 48;
export const MIN_ROW = 36;

type Sizes = { cols: Record<string, number>; rows: Record<string, number> };

function load(key: string): Sizes {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { cols: {}, rows: {} };
    const v = JSON.parse(raw) as Partial<Sizes>;
    return { cols: v.cols ?? {}, rows: v.rows ?? {} };
  } catch {
    return { cols: {}, rows: {} };
  }
}

function save(key: string, sizes: Sizes) {
  try {
    window.localStorage.setItem(key, JSON.stringify(sizes));
  } catch {
    // private window or storage off: sizes simply last until the page is closed
  }
}

/**
 * Column widths and row heights a person sets by dragging, like a spreadsheet. Kept in this
 * browser only (a per-person convenience); nothing is written to the database.
 */
export function useTableSizes(storageKey: string) {
  const [sizes, setSizes] = useState<Sizes>({ cols: {}, rows: {} });
  const loaded = useRef(false);

  useEffect(() => {
    setSizes(load(storageKey));
    loaded.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (loaded.current) save(storageKey, sizes);
  }, [storageKey, sizes]);

  const setCol = useCallback((key: string, w: number) => {
    setSizes((s) => ({ ...s, cols: { ...s.cols, [key]: Math.max(MIN_COL, Math.round(w)) } }));
  }, []);
  const setRow = useCallback((key: string, h: number) => {
    setSizes((s) => ({ ...s, rows: { ...s.rows, [key]: Math.max(MIN_ROW, Math.round(h)) } }));
  }, []);
  const reset = useCallback(() => setSizes({ cols: {}, rows: {} }), []);

  return {
    col: (key: string) => sizes.cols[key],
    row: (key: string) => sizes.rows[key],
    setCol,
    setRow,
    reset,
    changed: Object.keys(sizes.cols).length + Object.keys(sizes.rows).length > 0,
  };
}

/**
 * Follow a pointer drag from `start` (the size when it began): calls `onMove` with the new size
 * as the pointer moves along x (columns) or y (rows).
 */
export function startDrag(
  e: ReactPointerEvent,
  axis: "x" | "y",
  start: number,
  onMove: (size: number) => void,
) {
  e.preventDefault();
  e.stopPropagation();
  const from = axis === "x" ? e.clientX : e.clientY;
  const move = (ev: PointerEvent) =>
    onMove(start + (axis === "x" ? ev.clientX : ev.clientY) - from);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
