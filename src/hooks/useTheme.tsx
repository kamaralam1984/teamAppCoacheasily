import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  applyTheme,
  EVERYDAY,
  FALLBACK_THEMES,
  resolveTheme,
  sanitisePatch,
  THEME_STORAGE_KEY,
  type Particles,
  type Theme,
} from "@/lib/theme";

function useThemeRows() {
  return useQuery({
    queryKey: ["themes"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Theme[]> => {
      const { data, error } = await supabase
        .from("themes")
        .select("key,name,emoji,greeting,dates,patch,particles,sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        key: row.key,
        name: row.name,
        emoji: row.emoji,
        greeting: row.greeting,
        dates: row.dates ?? [],
        patch: sanitisePatch(row.patch),
        particles: (row.particles as Particles) ?? "embers",
        sort_order: row.sort_order,
      }));
    },
  });
}

interface ThemeCtx {
  themes: Theme[];
  theme: Theme;
  /** null = follow the calendar and the company default. */
  manualKey: string | null;
  setThemeKey: (key: string | null) => void;
  autoKey: string;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: rows } = useThemeRows();
  const [manualKey, setManual] = useState<string | null>(null);
  const [defaultKey, setDefaultKey] = useState<string | null>(null);

  useEffect(() => {
    setManual(window.localStorage.getItem(THEME_STORAGE_KEY));
  }, []);

  // The company default lives in org settings; missing settings are fine.
  useEffect(() => {
    let alive = true;
    void supabase
      .rpc("org_settings")
      .then(({ data }) => {
        if (!alive) return;
        const key = (data as { default_theme?: string } | null)?.default_theme;
        if (key) setDefaultKey(key);
      });
    return () => {
      alive = false;
    };
  }, []);

  const themes = rows && rows.length > 0 ? rows : FALLBACK_THEMES;
  const autoTheme = resolveTheme(themes, { defaultKey });
  const theme = resolveTheme(themes, { manualKey, defaultKey });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setThemeKey = useCallback((key: string | null) => {
    setManual(key);
    if (key) window.localStorage.setItem(THEME_STORAGE_KEY, key);
    else window.localStorage.removeItem(THEME_STORAGE_KEY);
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({ themes, theme, manualKey, setThemeKey, autoKey: autoTheme.key }),
    [themes, theme, manualKey, setThemeKey, autoTheme.key],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return (
    useContext(Ctx) ?? {
      themes: FALLBACK_THEMES,
      theme: EVERYDAY,
      manualKey: null,
      setThemeKey: () => undefined,
      autoKey: EVERYDAY.key,
    }
  );
}

/** HR and admin can pin the whole company to one theme. */
export function useSetCompanyTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.rpc("update_org_settings", {
        p_patch: { default_theme: key },
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org-settings"] }),
  });
}
