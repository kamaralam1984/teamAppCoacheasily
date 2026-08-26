import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type PrivateRecord = Tables<"profile_private">;
export type EducationRow = Tables<"profile_education">;
export type EmploymentRow = Tables<"profile_employment">;
export type MilestoneRow = Tables<"profile_milestones">;

/** The HR-only record. RLS decides who may read it — never the browser. */
export function useHrPrivate(profileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["hr-private", profileId],
    enabled: Boolean(profileId) && enabled,
    queryFn: async (): Promise<PrivateRecord | null> => {
      const { data, error } = await supabase
        .from("profile_private")
        .select("*")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveHrPrivate(profileId: string | null, orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<PrivateRecord>) => {
      const { error } = await supabase
        .from("profile_private")
        .upsert(
          { profile_id: profileId!, org_id: orgId!, ...patch } as TablesInsert<"profile_private">,
          { onConflict: "profile_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-private", profileId] }),
  });
}

export function useHrEducation(profileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["hr-education", profileId],
    enabled: Boolean(profileId) && enabled,
    queryFn: async (): Promise<EducationRow[]> => {
      const { data, error } = await supabase
        .from("profile_education")
        .select("*")
        .eq("profile_id", profileId!)
        .order("sort_order", { ascending: true })
        .order("end_year", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHrEmployment(profileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["hr-employment", profileId],
    enabled: Boolean(profileId) && enabled,
    queryFn: async (): Promise<EmploymentRow[]> => {
      const { data, error } = await supabase
        .from("profile_employment")
        .select("*")
        .eq("profile_id", profileId!)
        .order("sort_order", { ascending: true })
        .order("from_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHrMilestones(profileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["hr-milestones", profileId],
    enabled: Boolean(profileId) && enabled,
    queryFn: async (): Promise<MilestoneRow[]> => {
      const { data, error } = await supabase
        .from("profile_milestones")
        .select("*")
        .eq("profile_id", profileId!)
        .order("effective_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

type ListTable = "profile_education" | "profile_employment" | "profile_milestones";
const KEY: Record<ListTable, string> = {
  profile_education: "hr-education",
  profile_employment: "hr-employment",
  profile_milestones: "hr-milestones",
};

export function useAddHrRow(table: ListTable, profileId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { error } = await supabase.from(table).insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY[table], profileId] }),
  });
}

export function useRemoveHrRow(table: ListTable, profileId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [KEY[table], profileId] }),
  });
}

/** Documents stay in a private bucket. Links are short-lived, never public. */
export async function uploadHrDocument(
  profileId: string,
  kind: "pan" | "aadhaar",
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
  const path = `${profileId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("hr-documents").upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

export async function signedHrDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("hr-documents").createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}
