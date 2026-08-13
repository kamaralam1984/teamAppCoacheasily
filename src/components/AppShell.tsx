import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut } from "lucide-react";

import { Mark } from "@/components/Mark";
import { useMyProfile } from "@/hooks/useMyProfile";
import { supabase } from "@/integrations/supabase/client";

const TABS = [
  { label: "Home", to: "/dashboard" },
  { label: "Directory", to: "/dashboard" },
  { label: "Attendance", to: "/dashboard" },
  { label: "Leaves", to: "/dashboard" },
  { label: "Goals", to: "/dashboard" },
  { label: "Recognition", to: "/dashboard" },
  { label: "People & Culture", to: "/dashboard" },
  { label: "Change password", to: "/change-password" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMyProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const profile = data?.profile ?? null;

  return (
    <div className="min-h-screen bg-pearl">
      <header className="sticky top-0 z-40 bg-night">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <Mark size={34} color="#F0C75E" />
            <span className="leading-none">
              <span className="font-display text-xl text-white">Coach</span>
              <span className="font-display text-xl text-goldL">Easily</span>
              <span className="mt-0.5 block text-[10px] font-bold tracking-[0.22em] text-mist">
                TEAM APP
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-mist transition-colors hover:bg-night2 hover:text-goldL"
            >
              <Bell size={20} />
            </button>

            <Link
              to="/change-password"
              title="Change password"
              className="hidden max-w-[11rem] flex-col items-end leading-tight sm:flex"
            >
              <span className="max-w-[11rem] truncate text-sm font-semibold text-white">
                {isLoading ? "…" : (profile?.full_name ?? data?.user?.email ?? "")}
              </span>
              {profile?.role ? (
                <span className="text-[10px] font-bold tracking-[0.18em] text-goldL uppercase">
                  {profile.role}
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label="Sign out"
              className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-mist transition-colors hover:bg-night2 hover:text-goldL disabled:opacity-60"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        <nav className="no-scrollbar overflow-x-auto border-t border-night2 bg-night2">
          <div className="mx-auto flex max-w-6xl items-center gap-1 px-2">
            {TABS.map((tab) => (
              <Link
                key={tab.label}
                to={tab.to}
                className="shrink-0 rounded-md px-3 py-3 text-sm font-semibold whitespace-nowrap text-mist transition-colors hover:text-goldL"
                activeProps={{ className: "text-goldL" }}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-20">
        {isLoading ? (
          <div className="ce-card p-6 text-sm text-soft">Loading your workspace…</div>
        ) : profile ? (
          children
        ) : (
          <div className="ce-card mx-auto max-w-md p-6 text-center">
            <h2 className="font-display text-2xl text-ink">Almost there</h2>
            <p className="mt-2 text-sm text-soft">
              Your account isn't set up yet — ask People &amp; Culture to invite you.
            </p>
            <button className="btn3d btn3d-ghost mt-5" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default AppShell;
