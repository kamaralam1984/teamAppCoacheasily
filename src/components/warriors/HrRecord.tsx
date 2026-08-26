import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  signedHrDocumentUrl,
  uploadHrDocument,
  useAddHrRow,
  useHrEducation,
  useHrEmployment,
  useHrMilestones,
  useHrPrivate,
  useRemoveHrRow,
  useSaveHrPrivate,
  type PrivateRecord,
} from "@/hooks/useHrRecord";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/warriors";

const TABS = [
  "Personal",
  "Address",
  "Documents",
  "Emergency",
  "Education",
  "Previous work",
  "Journey",
] as const;
type Tab = (typeof TABS)[number];

const GENDERS = ["Woman", "Man", "Non-binary", "Prefer not to say"];
const MARITAL = [
  { value: "", label: "—" },
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MILESTONE_KINDS = [
  { value: "confirmed", label: "Confirmed after probation" },
  { value: "promoted", label: "Promoted" },
  { value: "role_change", label: "Role changed" },
  { value: "exited", label: "Exited" },
];
const MILESTONE_LABEL: Record<string, string> = {
  joined: "Joined CoachEasily",
  confirmed: "Confirmed after probation",
  promoted: "Promoted",
  role_change: "Role changed",
  exited: "Exited",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-soft uppercase">
      {children}
    </span>
  );
}

const inputCls =
  "min-h-11 w-full rounded-[12px] border border-line bg-pearl px-3 text-[15px] text-ink";

export function HrRecord({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>("Personal");
  const priv = useHrPrivate(profile.id, true);
  const savePriv = useSaveHrPrivate(profile.id, profile.org_id);
  const education = useHrEducation(profile.id, tab === "Education");
  const employment = useHrEmployment(profile.id, tab === "Previous work");
  const milestones = useHrMilestones(profile.id, tab === "Journey");
  const addEdu = useAddHrRow("profile_education", profile.id);
  const delEdu = useRemoveHrRow("profile_education", profile.id);
  const addEmp = useAddHrRow("profile_employment", profile.id);
  const delEmp = useRemoveHrRow("profile_employment", profile.id);
  const addMile = useAddHrRow("profile_milestones", profile.id);

  const [form, setForm] = useState<Partial<PrivateRecord>>({});
  const [dob, setDob] = useState(profile.date_of_birth ?? "");
  const [busy, setBusy] = useState(false);

  const [edu, setEdu] = useState({ institution: "", qualification: "", field: "", start_year: "", end_year: "" });
  const [emp, setEmp] = useState({ employer: "", designation: "", from_date: "", to_date: "", notes: "" });
  const [mile, setMile] = useState({ kind: "promoted", effective_on: "", designation: "", note: "", apply_title: false });

  useEffect(() => {
    if (priv.data) setForm(priv.data);
  }, [priv.data]);
  useEffect(() => {
    setDob(profile.date_of_birth ?? "");
  }, [profile.date_of_birth]);

  const set = (patch: Partial<PrivateRecord>) => setForm((f) => ({ ...f, ...patch }));

  const educationRows = useMemo(() => education.data ?? [], [education.data]);
  const employmentRows = useMemo(() => employment.data ?? [], [employment.data]);
  const milestoneRows = useMemo(() => milestones.data ?? [], [milestones.data]);

  async function saveCore() {
    const last4 = (form.aadhaar_last4 ?? "").trim();
    if (last4 && !/^\d{4}$/.test(last4)) {
      toast.error("Aadhaar must be exactly four digits.");
      return;
    }
    setBusy(true);
    try {
      await savePriv.mutateAsync({
        gender: form.gender ?? null,
        marital_status: form.marital_status ?? null,
        blood_group: form.blood_group ?? null,
        address_permanent: form.address_permanent ?? null,
        address_correspondence: form.address_correspondence ?? null,
        same_address: Boolean(form.same_address),
        pan_number: form.pan_number ?? null,
        pan_doc_path: form.pan_doc_path ?? null,
        aadhaar_last4: last4 === "" ? null : last4,
        aadhaar_doc_path: form.aadhaar_doc_path ?? null,
        emergency_name: form.emergency_name ?? null,
        emergency_relationship: form.emergency_relationship ?? null,
        emergency_phone: form.emergency_phone ?? null,
        notes: form.notes ?? null,
      });
      if ((profile.date_of_birth ?? "") !== dob) {
        const { error } = await supabase
          .from("profiles")
          .update({ date_of_birth: dob === "" ? null : dob })
          .eq("id", profile.id);
        if (error) throw error;
      }
      toast.success("Saved.");
    } catch {
      toast.error("That didn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(kind: "pan" | "aadhaar", file: File) {
    setBusy(true);
    try {
      const path = await uploadHrDocument(profile.id, kind, file);
      await savePriv.mutateAsync(
        kind === "pan" ? { pan_doc_path: path } : { aadhaar_doc_path: path },
      );
      set(kind === "pan" ? { pan_doc_path: path } : { aadhaar_doc_path: path });
      toast.success("Uploaded.");
    } catch {
      toast.error("That upload didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(path: string) {
    try {
      const url = await signedHrDocumentUrl(path);
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Couldn't open that document.");
    }
  }

  const saveBar = (
    <div className="mt-4">
      <button type="button" className="btn3d" disabled={busy} onClick={() => void saveCore()}>
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );

  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="font-display text-xl text-ink">HR record</h3>
      <p className="mt-1 text-[13px] text-soft">
        Only HR and Admin can see this. It is never shown on the org chart, Team or Reports.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              "min-h-11 rounded-full px-3.5 text-[12px] font-bold " +
              (tab === t ? "bg-ink text-ivory" : "border border-line text-ink hover:bg-cream")
            }
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Personal" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Gender</Label>
              <input
                className={inputCls}
                list="hr-genders"
                value={form.gender ?? ""}
                onChange={(e) => set({ gender: e.target.value })}
                placeholder="In their words"
              />
              <datalist id="hr-genders">
                {GENDERS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Marital status</Label>
              <select
                className={inputCls}
                value={form.marital_status ?? ""}
                onChange={(e) => set({ marital_status: e.target.value === "" ? null : e.target.value })}
              >
                {MARITAL.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Blood group</Label>
              <input
                className={inputCls}
                list="hr-blood"
                value={form.blood_group ?? ""}
                onChange={(e) => set({ blood_group: e.target.value })}
              />
              <datalist id="hr-blood">
                {BLOOD.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Date of birth</Label>
              <input
                type="date"
                className={inputCls}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <textarea
                className="min-h-24 w-full rounded-[12px] border border-line bg-pearl p-3 text-[15px] text-ink"
                value={form.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">{saveBar}</div>
          </div>
        ) : null}

        {tab === "Address" ? (
          <div className="space-y-4">
            <div>
              <Label>Permanent address</Label>
              <textarea
                className="min-h-24 w-full rounded-[12px] border border-line bg-pearl p-3 text-[15px] text-ink"
                value={form.address_permanent ?? ""}
                onChange={(e) =>
                  set({
                    address_permanent: e.target.value,
                    ...(form.same_address ? { address_correspondence: e.target.value } : {}),
                  })
                }
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={Boolean(form.same_address)}
                onChange={(e) =>
                  set({
                    same_address: e.target.checked,
                    ...(e.target.checked
                      ? { address_correspondence: form.address_permanent ?? "" }
                      : {}),
                  })
                }
              />
              Same as permanent
            </label>
            <div>
              <Label>Correspondence address</Label>
              <textarea
                className="min-h-24 w-full rounded-[12px] border border-line bg-pearl p-3 text-[15px] text-ink disabled:opacity-60"
                disabled={Boolean(form.same_address)}
                value={form.address_correspondence ?? ""}
                onChange={(e) => set({ address_correspondence: e.target.value })}
              />
            </div>
            {saveBar}
          </div>
        ) : null}

        {tab === "Documents" ? (
          <div className="space-y-4">
            <p className="rounded-[12px] bg-cream p-3 text-[13px] text-soft">
              Only HR and Admin can open these. Links expire in a couple of minutes.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>PAN number</Label>
                <input
                  className={inputCls}
                  value={form.pan_number ?? ""}
                  onChange={(e) => set({ pan_number: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <Label>PAN document</Label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="text-[13px] text-soft"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload("pan", f);
                  }}
                />
                {form.pan_doc_path ? (
                  <button
                    type="button"
                    className="mt-2 text-[13px] font-bold text-goldD underline"
                    onClick={() => void openDoc(form.pan_doc_path!)}
                  >
                    View uploaded PAN
                  </button>
                ) : null}
              </div>
              <div>
                <Label>Aadhaar — last 4 digits</Label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  maxLength={4}
                  value={form.aadhaar_last4 ?? ""}
                  onChange={(e) =>
                    set({ aadhaar_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                />
                <p className="mt-1.5 text-[12px] text-soft">
                  Only four digits are stored. The full number lives solely inside the uploaded
                  document, behind storage permissions.
                </p>
              </div>
              <div>
                <Label>Aadhaar document</Label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="text-[13px] text-soft"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload("aadhaar", f);
                  }}
                />
                {form.aadhaar_doc_path ? (
                  <button
                    type="button"
                    className="mt-2 text-[13px] font-bold text-goldD underline"
                    onClick={() => void openDoc(form.aadhaar_doc_path!)}
                  >
                    View uploaded Aadhaar
                  </button>
                ) : null}
              </div>
            </div>
            {saveBar}
          </div>
        ) : null}

        {tab === "Emergency" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <input
                className={inputCls}
                value={form.emergency_name ?? ""}
                onChange={(e) => set({ emergency_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Relationship</Label>
              <input
                className={inputCls}
                value={form.emergency_relationship ?? ""}
                onChange={(e) => set({ emergency_relationship: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <input
                className={inputCls}
                value={form.emergency_phone ?? ""}
                onChange={(e) => set({ emergency_phone: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">{saveBar}</div>
          </div>
        ) : null}

        {tab === "Education" ? (
          <div className="space-y-3">
            {educationRows.length === 0 ? (
              <p className="text-sm text-soft">Nothing recorded yet.</p>
            ) : (
              educationRows.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 rounded-[12px] border border-line p-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink">{r.institution}</p>
                    <p className="text-[13px] text-soft">
                      {[r.qualification, r.field].filter(Boolean).join(" · ") || "—"}
                      {r.start_year || r.end_year
                        ? ` · ${r.start_year ?? "?"}–${r.end_year ?? "present"}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-[12px] font-bold text-red"
                    onClick={() => delEdu.mutate(r.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            <div className="grid gap-3 rounded-[12px] bg-cream p-3 sm:grid-cols-2">
              <input
                className={inputCls}
                placeholder="Institution"
                value={edu.institution}
                onChange={(e) => setEdu({ ...edu, institution: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Qualification"
                value={edu.qualification}
                onChange={(e) => setEdu({ ...edu, qualification: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Field"
                value={edu.field}
                onChange={(e) => setEdu({ ...edu, field: e.target.value })}
              />
              <div className="flex gap-3">
                <input
                  className={inputCls}
                  placeholder="From year"
                  inputMode="numeric"
                  value={edu.start_year}
                  onChange={(e) => setEdu({ ...edu, start_year: e.target.value })}
                />
                <input
                  className={inputCls}
                  placeholder="To year"
                  inputMode="numeric"
                  value={edu.end_year}
                  onChange={(e) => setEdu({ ...edu, end_year: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="btn3d"
                  disabled={!edu.institution.trim()}
                  onClick={() =>
                    addEdu.mutate(
                      {
                        org_id: profile.org_id,
                        profile_id: profile.id,
                        institution: edu.institution.trim(),
                        qualification: edu.qualification.trim() || null,
                        field: edu.field.trim() || null,
                        start_year: edu.start_year ? Number(edu.start_year) : null,
                        end_year: edu.end_year ? Number(edu.end_year) : null,
                        sort_order: educationRows.length,
                      },
                      {
                        onSuccess: () =>
                          setEdu({ institution: "", qualification: "", field: "", start_year: "", end_year: "" }),
                        onError: () => toast.error("That didn't save."),
                      },
                    )
                  }
                >
                  Add education
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "Previous work" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-soft">Work before CoachEasily.</p>
            {employmentRows.length === 0 ? (
              <p className="text-sm text-soft">Nothing recorded yet.</p>
            ) : (
              employmentRows.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 rounded-[12px] border border-line p-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink">{r.employer}</p>
                    <p className="text-[13px] text-soft">
                      {[r.designation, r.from_date ? `${r.from_date} – ${r.to_date ?? "present"}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {r.notes ? <p className="mt-1 text-[13px] text-soft">{r.notes}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="text-[12px] font-bold text-red"
                    onClick={() => delEmp.mutate(r.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            <div className="grid gap-3 rounded-[12px] bg-cream p-3 sm:grid-cols-2">
              <input
                className={inputCls}
                placeholder="Employer"
                value={emp.employer}
                onChange={(e) => setEmp({ ...emp, employer: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Designation"
                value={emp.designation}
                onChange={(e) => setEmp({ ...emp, designation: e.target.value })}
              />
              <input
                type="date"
                className={inputCls}
                value={emp.from_date}
                onChange={(e) => setEmp({ ...emp, from_date: e.target.value })}
              />
              <input
                type="date"
                className={inputCls}
                value={emp.to_date}
                onChange={(e) => setEmp({ ...emp, to_date: e.target.value })}
              />
              <input
                className={`${inputCls} sm:col-span-2`}
                placeholder="Notes"
                value={emp.notes}
                onChange={(e) => setEmp({ ...emp, notes: e.target.value })}
              />
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="btn3d"
                  disabled={!emp.employer.trim()}
                  onClick={() =>
                    addEmp.mutate(
                      {
                        org_id: profile.org_id,
                        profile_id: profile.id,
                        employer: emp.employer.trim(),
                        designation: emp.designation.trim() || null,
                        from_date: emp.from_date || null,
                        to_date: emp.to_date || null,
                        notes: emp.notes.trim() || null,
                        sort_order: employmentRows.length,
                      },
                      {
                        onSuccess: () =>
                          setEmp({ employer: "", designation: "", from_date: "", to_date: "", notes: "" }),
                        onError: () => toast.error("That didn't save."),
                      },
                    )
                  }
                >
                  Add employer
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "Journey" ? (
          <div className="space-y-3">
            {milestoneRows.length === 0 ? (
              <p className="text-sm text-soft">Nothing recorded yet.</p>
            ) : (
              milestoneRows.map((m) => (
                <div key={m.id} className="rounded-[12px] border border-line p-3">
                  <p className="text-[15px] font-bold text-ink">
                    {MILESTONE_LABEL[m.kind] ?? m.kind}
                  </p>
                  <p className="text-[13px] text-soft">
                    {m.effective_on}
                    {m.designation ? ` · ${m.designation}` : ""}
                  </p>
                  {m.note ? <p className="mt-1 text-[13px] text-soft">{m.note}</p> : null}
                </div>
              ))
            )}
            <div className="grid gap-3 rounded-[12px] bg-cream p-3 sm:grid-cols-2">
              <select
                className={inputCls}
                value={mile.kind}
                onChange={(e) => setMile({ ...mile, kind: e.target.value })}
              >
                {MILESTONE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className={inputCls}
                value={mile.effective_on}
                onChange={(e) => setMile({ ...mile, effective_on: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Designation"
                value={mile.designation}
                onChange={(e) => setMile({ ...mile, designation: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Note"
                value={mile.note}
                onChange={(e) => setMile({ ...mile, note: e.target.value })}
              />
              {(mile.kind === "promoted" || mile.kind === "role_change") && mile.designation.trim() ? (
                <label className="flex items-center gap-3 text-sm text-ink sm:col-span-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={mile.apply_title}
                    onChange={(e) => setMile({ ...mile, apply_title: e.target.checked })}
                  />
                  Also update their current title to “{mile.designation.trim()}”
                </label>
              ) : null}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="btn3d"
                  disabled={!mile.effective_on}
                  onClick={() =>
                    addMile.mutate(
                      {
                        org_id: profile.org_id,
                        profile_id: profile.id,
                        kind: mile.kind,
                        effective_on: mile.effective_on,
                        designation: mile.designation.trim() || null,
                        note: mile.note.trim() || null,
                      },
                      {
                        onSuccess: async () => {
                          if (mile.apply_title && mile.designation.trim()) {
                            const { error } = await supabase
                              .from("profiles")
                              .update({ title: mile.designation.trim() })
                              .eq("id", profile.id);
                            if (error) toast.error("Milestone saved, but the title didn't update.");
                          }
                          setMile({
                            kind: "promoted",
                            effective_on: "",
                            designation: "",
                            note: "",
                            apply_title: false,
                          });
                          toast.success("Milestone added.");
                        },
                        onError: () => toast.error("That didn't save."),
                      },
                    )
                  }
                >
                  Add milestone
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
