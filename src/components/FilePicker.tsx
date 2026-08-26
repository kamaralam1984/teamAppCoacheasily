import { useEffect, useId, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";

export interface FilePickerProps {
  /** What the button says — never the browser's own wording. */
  label: string;
  /** Same string you would give a native input. */
  accept: string;
  /** Largest file we will take, in bytes. */
  maxBytes: number;
  /** Called with the chosen file, or null when it is cleared. */
  onSelect: (file: File | null) => void | Promise<void>;
  /** True while the caller is uploading — the button says so and locks. */
  uploading?: boolean;
  uploadingLabel?: string;
  disabled?: boolean;
  /** Something already stored: show it as the chosen state. */
  existing?: { name: string; url?: string | null; isImage?: boolean } | null;
  /** Offered as "Remove" when there is something to remove. */
  onRemove?: () => void | Promise<void>;
  hint?: string;
}

function prettySize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function kindWords(accept: string): string {
  const parts = accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const words = parts.map((p) => {
    if (p === "image/*") return "an image";
    if (p === "application/pdf") return "a PDF";
    if (p.startsWith("image/")) return p.replace("image/", "").toUpperCase();
    return p;
  });
  return words.join(", ");
}

function matches(file: File, accept: string): boolean {
  const parts = accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return true;
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return parts.some((p) => {
    if (p.startsWith(".")) return name.endsWith(p);
    if (p.endsWith("/*")) return type.startsWith(p.slice(0, -1));
    return type === p;
  });
}

/**
 * One upload control for the whole app. Presentation only — the caller still
 * decides what is uploaded and where it goes.
 */
export function FilePicker({
  label,
  accept,
  maxBytes,
  onSelect,
  uploading = false,
  uploadingLabel = "Uploading…",
  disabled = false,
  existing = null,
  onRemove,
  hint,
}: FilePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (chosenUrl) URL.revokeObjectURL(chosenUrl);
    };
  }, [chosenUrl]);

  const locked = disabled || uploading;

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function take(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    if (!matches(file, accept)) {
      setError(`That file is not something we can take here. Please choose ${kindWords(accept)}.`);
      clearInput();
      return;
    }
    if (file.size > maxBytes) {
      setError(
        `That file is ${prettySize(file.size)}. Please choose one under ${prettySize(maxBytes)}.`,
      );
      clearInput();
      return;
    }
    if (chosenUrl) URL.revokeObjectURL(chosenUrl);
    setChosen(file);
    setChosenUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    void onSelect(file);
  }

  async function remove() {
    if (chosenUrl) URL.revokeObjectURL(chosenUrl);
    setChosen(null);
    setChosenUrl(null);
    setError(null);
    clearInput();
    void onSelect(null);
    if (onRemove) await onRemove();
  }

  const showChosen = Boolean(chosen || existing);
  const name = chosen?.name ?? existing?.name ?? "";
  const size = chosen ? prettySize(chosen.size) : null;
  const thumb = chosenUrl ?? (existing?.isImage === false ? null : (existing?.url ?? null));

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={accept}
      disabled={locked}
      className="sr-only"
      onChange={(e) => take(e.target.files?.[0])}
    />
  );

  return (
    <div
      onDragOver={(e) => {
        if (locked) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (locked) return;
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-[14px] border border-dashed p-3 transition-colors ${
        dragging ? "border-goldD bg-gold/10" : "border-line bg-transparent"
      }`}
    >
      {input}

      {showChosen ? (
        <div className="flex flex-wrap items-center gap-3">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="h-14 w-14 rounded-[12px] border border-line object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-[12px] border border-line text-soft">
              <FileText size={20} aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-ink">{name || "Chosen file"}</p>
            <p className="text-[12px] text-soft">{uploading ? uploadingLabel : (size ?? "Saved")}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button
              type="button"
              className="btn3d btn3d-ghost min-h-11 w-full sm:w-auto"
              disabled={locked}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              className="btn3d btn3d-ghost min-h-11 w-full sm:w-auto"
              disabled={locked}
              onClick={() => void remove()}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={inputId}
            className={`btn3d inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 sm:w-auto ${
              locked ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <Upload size={16} aria-hidden />
            {uploading ? uploadingLabel : label}
          </label>
          <span className="text-[12px] text-soft">or drop a file here</span>
        </div>
      )}

      {hint ? <p className="mt-2 text-[12px] text-soft">{hint}</p> : null}
      {error ? <p className="mt-2 text-[12px] font-bold text-goldD">{error}</p> : null}
    </div>
  );
}

export default FilePicker;
