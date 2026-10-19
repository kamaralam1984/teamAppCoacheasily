import type { ReactNode } from "react";
import { errMsg } from "@/hooks/useDeveloper";

export function Loading({ what }: { what: string }) {
  return <div className="ce-card p-6 text-sm text-soft">Loading {what}…</div>;
}

export function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="ce-card p-6 text-sm text-soft">
      {errMsg(error)}
      <button className="btn3d btn3d-ghost mt-3 block" onClick={retry}>Retry</button>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ce-card p-4 ${className}`}>{children}</div>;
}
