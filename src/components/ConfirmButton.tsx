import { useState } from "react";

interface Props {
  /** What the button says before anything happens. */
  label: string;
  /** Plain-language sentence naming exactly what will be lost. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Nothing a warrior clicks should destroy data on the first click.
 * The armed state names what is about to go, then asks again.
 */
export function ConfirmButton({
  label,
  message,
  confirmLabel = "Yes, remove",
  cancelLabel = "Keep",
  onConfirm,
  pending = false,
  className,
  ariaLabel,
}: Props) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        className={
          className ?? "min-h-11 rounded-lg border border-line px-3 text-sm font-bold text-red"
        }
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-[12px] border border-red/40 bg-red/8 p-3">
      <p className="text-[13px] leading-relaxed font-bold text-ink">{message}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="min-h-11 flex-1 rounded-lg border border-line bg-ivory px-3 text-[13px] font-bold text-ink"
          onClick={() => setArmed(false)}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="min-h-11 flex-1 rounded-lg bg-red px-3 text-[13px] font-bold text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => {
            onConfirm();
            setArmed(false);
          }}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
