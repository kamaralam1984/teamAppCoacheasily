import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Mark } from "@/components/Mark";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoachEasily Team App" },
      {
        name: "description",
        content:
          "The internal operating system for CoachEasily warriors — directory, people and culture, all in one place.",
      },
      { property: "og:title", content: "CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "The internal operating system for CoachEasily warriors — directory, people and culture, all in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-pearl px-4 text-center">
      <Mark size={56} color="#C9A227" />
      <h1 className="font-display text-3xl text-ink">
        <span>Coach</span>
        <span className="text-goldD">Easily</span>
      </h1>
      <p className="text-sm text-soft">Taking you to the team app…</p>
    </div>
  );
}
