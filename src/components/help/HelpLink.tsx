import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { helpForScreen, type HelpScreen } from "@/lib/help";

/** A quiet "How do I use this?" beside a screen heading. */
export function HelpLink({ screen, tone = "ink" }: { screen: HelpScreen; tone?: "ink" | "light" }) {
  const [open, setOpen] = useState(false);
  const topic = helpForScreen(screen);
  if (!topic) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          tone === "light"
            ? "inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-mist underline-offset-4 hover:underline"
            : "inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-soft underline-offset-4 hover:text-goldD hover:underline"
        }
      >
        <HelpCircle size={15} /> How do I use this?
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border-line bg-ivory sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ink">{topic.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {topic.body.map((line, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-soft">
                {line}
              </p>
            ))}
          </div>
          <Link
            to="/help"
            onClick={() => setOpen(false)}
            className="mt-4 inline-block text-sm font-semibold text-goldD underline underline-offset-4"
          >
            See help for everything →
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
