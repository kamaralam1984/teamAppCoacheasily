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
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
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

/** The company default, kept fresh so an admin's choice reaches everybody. */
function useCompanyDefault() {
  return useQuery({
    queryKey: ["org-settings", "default_theme"],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.rpc("org_settings");
      return (data as { default_theme?: string } | null)?.default_theme ?? null;
    },
  });
}

/** Only People & Culture and Admin may deviate from the company theme. */
function useCanChooseTheme() {
  const { data } = useQuery({
    queryKey: ["my-role"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data: role } = await supabase.rpc("my_role");
      return (role as string | null) ?? null;
    },
  });
  return data === "hr" || data === "admin";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: rows } = useThemeRows();
  const { data: companyKey } = useCompanyDefault();
  const canChoose = useCanChooseTheme();
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    setStored(window.localStorage.getItem(THEME_STORAGE_KEY));
  }, []);

  const defaultKey = companyKey ?? null;
  // A personal pick is honoured only for the people who own the office theme.
  const manualKey = canChoose ? stored : null;

  const themes = rows && rows.length > 0 ? rows : FALLBACK_THEMES;
  const autoTheme = resolveTheme(themes, { defaultKey });
  const theme = resolveTheme(themes, { manualKey, defaultKey });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setThemeKey = useCallback((key: string | null) => {
    setStored(key);
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
