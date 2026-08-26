import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { FilePicker } from "@/components/FilePicker";
import { WarriorAvatar } from "@/components/warriors/Avatar";
import { useAttendanceSummary } from "@/hooks/useAttendance";
import {
  useAddHrRow,
  useHrEducation,
  useHrEmployment,
  useHrPrivate,
  useRemoveHrRow,
  useSaveHrPrivate,
  type PrivateRecord,
} from "@/hooks/useHrRecord";
import { useLeaveBalances, TYPE_LABEL } from "@/hooks/useLeave";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useUpdateMyProfile } from "@/hooks/useMyDetails";
import { useWarriors } from "@/hooks/useWarriors";
import { removeAvatarFile, uploadAvatar } from "@/lib/avatar";
import { signAvatar } from "@/hooks/useAvatars";
import { roleLabel } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile | CoachEasily Team App" },
      {
        name: "description",
        content: "Your photo, your details and your leave at a glance — kept by you, not by HR.",
      },
      { property: "og:title", content: "My profile | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Your photo, your details and your leave at a glance — kept by you, not by HR.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

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

const inputCls =
  "min-h-11 w-full rounded-[12px] border border-line bg-pearl px-3 text-[15px] text-ink";
const areaCls = "min-h-24 w-full rounded-[12px] border border-line bg-pearl p-3 text-[15px] text-ink";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-soft uppercase">
      {children}
    </span>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ce-card ce-rise p-6">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      {note ? <p className="mt-1.5 text-[13px] text-soft">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="text-[15px] text-ink">{value || "—"}</p>
    </div>
  );
}

function message(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "That didn't save. Please try again.";
}

function ProfilePage() {
  const { data: mine } = useMyProfile();
  const profile = mine?.profile ?? null;
  const profileId = profile?.id ?? null;

  const { data: warriors } = useWarriors();
  const priv = useHrPrivate(profileId, Boolean(profileId));
  const savePriv = useSaveHrPrivate(profileId, profile?.org_id ?? null);
  const updateMe = useUpdateMyProfile(profileId);
  const education = useHrEducation(profileId, Boolean(profileId));
  const employment = useHrEmployment(profileId, Boolean(profileId));
  const addEdu = useAddHrRow("profile_education", profileId);
  const delEdu = useRemoveHrRow("profile_education", profileId);
  const addEmp = useAddHrRow("profile_employment", profileId);
  const delEmp = useRemoveHrRow("profile_employment", profileId);
  const balances = useLeaveBalances();
  const attendance = useAttendanceSummary();

  const [about, setAbout] = useState({ bio: "", fun_fact: "", date_of_birth: "", phone: "" });
  const [form, setForm] = useState<Partial<PrivateRecord>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingAbout, setSavingAbout] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [edu, setEdu] = useState({ institution: "", qualification: "", field: "", start_year: "", end_year: "" });
  const [emp, setEmp] = useState({ employer: "", designation: "", from_date: "", to_date: "", notes: "" });

  useEffect(() => {
    if (!profile) return;
    setAbout({
      bio: profile.bio ?? "",
      fun_fact: profile.fun_fact ?? "",
      date_of_birth: profile.date_of_birth ?? "",
      phone: profile.phone ?? "",
    });
  }, [profile]);

  useEffect(() => {
    if (priv.data) setForm(priv.data);
  }, [priv.data]);

  const manager = useMemo(
    () => (warriors ?? []).find((p) => p.id === profile?.manager_id) ?? null,
    [warriors, profile?.manager_id],
  );
  const educationRows = education.data ?? [];
  const employmentRows = employment.data ?? [];

  const set = (patch: Partial<PrivateRecord>) => setForm((f) => ({ ...f, ...patch }));

  async function onPickPhoto(file: File) {
    if (!profileId) return;
    setBusy(true);
    const previous = profile?.avatar_url ?? null;
    try {
      const path = await uploadAvatar(profileId, file);
      await updateMe.mutateAsync({ avatar_url: path });
      const signed = await signAvatar(path);
      setPreview(signed);
      if (previous) await removeAvatarFile(previous);
      toast.success("Photo updated.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhoto() {
    if (!profileId) return;
    setBusy(true);
    const previous = profile?.avatar_url ?? null;
    try {
      await updateMe.mutateAsync({ avatar_url: null });
      setPreview(null);
      if (previous) await removeAvatarFile(previous);
      toast.success("Photo removed.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAbout() {
    setSavingAbout(true);
    try {
      await updateMe.mutateAsync({
        bio: about.bio.trim() === "" ? null : about.bio.trim(),
        fun_fact: about.fun_fact.trim() === "" ? null : about.fun_fact.trim(),
        date_of_birth: about.date_of_birth === "" ? null : about.date_of_birth,
        phone: about.phone.trim() === "" ? null : about.phone.trim(),
      });
      toast.success("Saved.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSavingAbout(false);
    }
  }

  async function savePersonal() {
    setSavingPersonal(true);
    try {
      await savePriv.mutateAsync({
        gender: form.gender ?? null,
        marital_status: form.marital_status ?? null,
        blood_group: form.blood_group ?? null,
        address_permanent: form.address_permanent ?? null,
        address_correspondence: form.address_correspondence ?? null,
        same_address: Boolean(form.same_address),
        emergency_name: form.emergency_name ?? null,
        emergency_relationship: form.emergency_relationship ?? null,
        emergency_phone: form.emergency_phone ?? null,
      });
      toast.success("Saved.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSavingPersonal(false);
    }
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="ce-card p-6 text-sm text-soft">Loading your profile…</div>
      </AppShell>
    );
  }

  const label = roleLabel(profile.role);

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="ce-rise">
          <h1 className="font-display text-4xl leading-tight text-ink">My profile</h1>
          <p className="mt-1.5 text-sm text-soft">
            Keep this yours. Most of it you can change here, any time.
          </p>
        </header>

        <Section title="Your photo" note="A clear face helps the team put a name to a person.">
          <div className="flex flex-col items-center gap-4">
            <WarriorAvatar
              name={profile.full_name}
              size={132}
              birthday={profile.birthday}
              path={profile.avatar_url}
              src={preview}
            />
            <div className="w-full max-w-md">
              <FilePicker
                label={profile.avatar_url ? "Change your photo" : "Add your photo"}
                accept="image/jpeg,image/png,image/webp"
                maxBytes={3 * 1024 * 1024}
                uploading={busy}
                uploadingLabel="Uploading…"
                hint="JPEG, PNG or WEBP, up to 3MB. It is shrunk before upload."
                onSelect={(f) => {
                  if (f) void onPickPhoto(f);
                }}
                {...(profile.avatar_url ? { onRemove: onRemovePhoto } : {})}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Who you are"
          note="Your name, role, department and reporting line are looked after by HR — ask them if anything here is wrong."
        >
          <div className="min-w-0">
            <p className="font-display text-2xl leading-tight text-ink">{profile.full_name}</p>
            <p className="mt-0.5 text-sm text-soft">{profile.title ?? "—"}</p>
            {label ? (
              <span className="mt-2 inline-block rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold tracking-wider text-goldD uppercase">
                {label}
              </span>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Read label="Department" value={profile.department ?? "—"} />
            <Read label="Reports to" value={manager?.full_name ?? "—"} />
            <Read label="Weekly off" value={profile.weekly_off ?? "—"} />
            <Read label="Joined" value={profile.joined_on ?? "—"} />
          </div>
        </Section>


        <Section title="About you">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>A short bio</Label>
              <textarea
                className={areaCls}
                value={about.bio}
                placeholder="A line or two about you."
                onChange={(e) => setAbout({ ...about, bio: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>One human detail</Label>
              <input
                className={inputCls}
                value={about.fun_fact}
                placeholder="Something the team would enjoy knowing."
                onChange={(e) => setAbout({ ...about, fun_fact: e.target.value })}
              />
            </div>
            <div>
              <Label>Date of birth</Label>
              <input
                type="date"
                className={inputCls}
                value={about.date_of_birth}
                onChange={(e) => setAbout({ ...about, date_of_birth: e.target.value })}
              />
              <p className="mt-1.5 text-[12px] text-soft">
                This is how the team knows when to celebrate. Only the day and month are ever
                shown — the year is never seen by anybody but HR.
              </p>
            </div>
            <div>
              <Label>Phone</Label>
              <input
                className={inputCls}
                inputMode="tel"
                value={about.phone}
                onChange={(e) => setAbout({ ...about, phone: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                className="btn3d"
                disabled={savingAbout}
                onClick={() => void saveAbout()}
              >
                {savingAbout ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Section>

        <Section title="Personal details" note="Only you and HR can see this.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Gender</Label>
              <input
                className={inputCls}
                list="me-genders"
                value={form.gender ?? ""}
                onChange={(e) => set({ gender: e.target.value })}
                placeholder="In your words"
              />
              <datalist id="me-genders">
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
                onChange={(e) =>
                  set({ marital_status: e.target.value === "" ? null : e.target.value })
                }
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
                list="me-blood"
                value={form.blood_group ?? ""}
                onChange={(e) => set({ blood_group: e.target.value })}
              />
              <datalist id="me-blood">
                {BLOOD.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <Label>Permanent address</Label>
              <textarea
                className={areaCls}
                value={form.address_permanent ?? ""}
                onChange={(e) =>
                  set({
                    address_permanent: e.target.value,
                    ...(form.same_address ? { address_correspondence: e.target.value } : {}),
                  })
                }
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-ink sm:col-span-2">
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
            <div className="sm:col-span-2">
              <Label>Correspondence address</Label>
              <textarea
                className={`${areaCls} disabled:opacity-60`}
                disabled={Boolean(form.same_address)}
                value={form.address_correspondence ?? ""}
                onChange={(e) => set({ address_correspondence: e.target.value })}
              />
            </div>
            <div>
              <Label>Emergency contact</Label>
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
              <Label>Emergency phone</Label>
              <input
                className={inputCls}
                inputMode="tel"
                value={form.emergency_phone ?? ""}
                onChange={(e) => set({ emergency_phone: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                className="btn3d"
                disabled={savingPersonal}
                onClick={() => void savePersonal()}
              >
                {savingPersonal ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Section>

        <Section title="Education">
          <div className="space-y-3">
            {educationRows.length === 0 ? (
              <p className="text-sm text-soft">Nothing here yet.</p>
            ) : (
              educationRows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-[12px] border border-line p-3"
                >
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
                    onClick={() =>
                      delEdu.mutate(r.id, { onError: (e) => toast.error(message(e)) })
                    }
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
                          setEdu({
                            institution: "",
                            qualification: "",
                            field: "",
                            start_year: "",
                            end_year: "",
                          }),
                        onError: (e) => toast.error(message(e)),
                      },
                    )
                  }
                >
                  Add education
                </button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Previous employment" note="Work before CoachEasily.">
          <div className="space-y-3">
            {employmentRows.length === 0 ? (
              <p className="text-sm text-soft">Nothing here yet.</p>
            ) : (
              employmentRows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-[12px] border border-line p-3"
                >
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
                    onClick={() =>
                      delEmp.mutate(r.id, { onError: (e) => toast.error(message(e)) })
                    }
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
                          setEmp({
                            employer: "",
                            designation: "",
                            from_date: "",
                            to_date: "",
                            notes: "",
                          }),
                        onError: (e) => toast.error(message(e)),
                      },
                    )
                  }
                >
                  Add employment
                </button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Documents" note="HR keeps these. Send them any change.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Read label="PAN number" value={priv.data?.pan_number ?? ""} />
            <Read
              label="Aadhaar"
              value={priv.data?.aadhaar_last4 ? `•••• •••• ${priv.data.aadhaar_last4}` : ""}
            />
          </div>
        </Section>

        <Section title="Your leave, at a glance" note="Straight from the books — nothing recalculated here.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(balances.data ?? []).map((b) => (
              <div key={b.type} className="rounded-[12px] bg-cream p-3">
                <p className="text-[11px] font-bold tracking-[0.14em] text-soft uppercase">
                  {TYPE_LABEL[b.type] ?? b.type}
                </p>
                <p className="font-display text-2xl text-ink">{b.balance}</p>
                <p className="text-[12px] text-soft">
                  {b.used} used · {b.pending} pending · {b.entitled} entitled
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[12px] bg-cream p-3">
            <p className="text-[11px] font-bold tracking-[0.14em] text-soft uppercase">
              Days worked
            </p>
            <p className="font-display text-2xl text-ink">
              {attendance.data?.days_marked ?? "—"}
            </p>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
