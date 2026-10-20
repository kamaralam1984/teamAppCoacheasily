import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { DevOverview } from "@/components/developer/DevOverview";
import { DevUsers } from "@/components/developer/DevUsers";
import { DevData } from "@/components/developer/DevData";
import { DevAttendance } from "@/components/developer/DevAttendance";
import { DevOrganisation } from "@/components/developer/DevOrganisation";
import { DevAudit } from "@/components/developer/DevAudit";
import { DevTeamOrder } from "@/components/developer/DevTeamOrder";
import { errMsg, useDeveloperAccess } from "@/hooks/useDeveloper";

export const Route = createFileRoute("/_authenticated/developer")({
  head: () => ({
    meta: [
      { title: "Developer | CoachEasily Team App" },
      { name: "description", content: "Developer tools for maintaining the CoachEasily team app." },
      { property: "og:title", content: "Developer | CoachEasily Team App" },
      { property: "og:description", content: "Developer tools for maintaining the CoachEasily team app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const SECTIONS = ["Overview", "Users", "Data", "Attendance", "Organisation", "Team order", "Audit log"] as const;
type Section = (typeof SECTIONS)[number];

function Page() {
  const access = useDeveloperAccess();
  const [section, setSection] = useState<Section>("Overview");
  const [table, setTable] = useState("profiles");

  return (
    <AppShell>
      <h1 className="font-display text-3xl text-ink">Developer</h1>
      {access.isLoading ? (
        <div className="ce-card mt-4 p-6 text-sm text-soft">Checking access…</div>
      ) : access.error ? (
        <div className="ce-card mt-4 p-6 text-sm text-soft">
          Couldn't check access: {errMsg(access.error)}
          <button className="btn3d btn3d-ghost mt-3 block" onClick={() => void access.refetch()}>Retry</button>
        </div>
      ) : !access.data?.isDeveloper ? (
        <div className="ce-card mt-4 p-6 text-sm text-soft">This view is for developers only.</div>
      ) : (
        <>
          <p className="mt-1 text-sm text-soft">Signed in as {access.data.email}. Every change is logged.</p>
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap ${
                  section === s ? "bg-night text-goldL" : "bg-card text-soft border border-border"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {section === "Overview" && <DevOverview onOpenTable={(t) => { setTable(t); setSection("Data"); }} />}
            {section === "Users" && <DevUsers />}
            {section === "Data" && <DevData table={table} onTable={setTable} />}
            {section === "Attendance" && <DevAttendance />}
            {section === "Organisation" && <DevOrganisation />}
            {section === "Team order" && <DevTeamOrder />}
            {section === "Audit log" && <DevAudit />}
          </div>
        </>
      )}
    </AppShell>
  );
}
