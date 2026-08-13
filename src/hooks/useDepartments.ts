import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { DEPARTMENTS } from "@/lib/warriors";

export type Department = Tables<"departments">;

/** Leadership first, then alphabetical — the order People & Culture asked for. */
export function sortDepartments<T extends { name: string; sort_order?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.name === "Leadership") return -1;
    if (b.name === "Leadership") return 1;
    return a.name.localeCompare(b.name);
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase.from("departments").select("*");
      if (error) throw error;
      return sortDepartments(data ?? []);
    },
  });
}

/** Names only, with the built-in list as a safety net so a dropdown is never empty. */
export function useDepartmentNames(): string[] {
  const { data } = useDepartments();
  const names = (data ?? []).map((d) => d.name);
  return names.length > 0 ? names : sortDepartments(DEPARTMENTS.map((name) => ({ name }))).map((d) => d.name);
}

/** A new department starts life with a daily playbook so nobody faces a blank page. */
const STARTER_PLAYBOOK = [
  "Pick the one thing that matters most today",
  "Move every open item one step forward",
  "Log what happened, honestly",
];

export function useEditDepartments(orgId?: string | null) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["departments"] });
    void qc.invalidateQueries({ queryKey: ["playbook"] });
    void qc.invalidateQueries({ queryKey: ["warriors"] });
  };

  const add = useMutation({
    mutationFn: async (name: string) => {
      if (!orgId) throw new Error("Your profile isn't set up yet.");
      const clean = name.trim();
      if (!clean) throw new Error("A department needs a name.");
      const { error } = await supabase
        .from("departments")
        .insert({ org_id: orgId, name: clean, sort_order: 100 });
      if (error) throw error;

      const { data: existing } = await supabase
        .from("sop_items")
        .select("id")
        .eq("department", clean)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from("sop_items").insert(
          STARTER_PLAYBOOK.map((text, i) => ({
            org_id: orgId,
            department: clean,
            text,
            sort_order: (i + 1) * 10,
          })),
        );
      }
    },
    onSuccess: done,
  });

  const rename = useMutation({
    mutationFn: async ({ id, from, to }: { id: string; from: string; to: string }) => {
      const clean = to.trim();
      if (!clean) throw new Error("A department needs a name.");
      const { error } = await supabase.from("departments").update({ name: clean }).eq("id", id);
      if (error) throw error;
      // Carry the people and the playbook across with it.
      await supabase.from("profiles").update({ department: clean }).eq("department", from);
      await supabase.from("sop_items").update({ department: clean }).eq("department", from);
      await supabase.from("daily_codes").update({ department: clean }).eq("department", from);
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("department", name)
        .eq("status", "active");
      if ((count ?? 0) > 0) {
        throw new Error(
          `${count} warrior${count === 1 ? " is" : "s are"} still in ${name}. Move them first.`,
        );
      }
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });

  return { add, rename, remove };
}
