import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { devIdDocs, devImpersonateLink, devListUsers, devSaveIdDocs, devUpdateProfile, devUserAction } from "@/lib/developer.functions";
import { resizeImage } from "@/lib/avatar";
import { FilePicker } from "@/components/FilePicker";
import { impersonationBlockedReason } from "@/lib/developerImpersonation";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { errMsg } from "@/hooks/useDeveloper";
import { Card, Failed, Loading } from "./shared";

type UserRow = Awaited<ReturnType<typeof devListUsers>>["rows"][number];

export function DevUsers() {
  const fn = useServerFn(devListUsers);
  const q = useQuery({ queryKey: ["dev-users"], queryFn: () => fn() });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (q.data?.rows ?? []).filter((r) =>
      [r.full_name, r.email, r.department].some((v) => v?.toLowerCase().includes(s)),
    );
  }, [q.data, search]);
  if (q.isLoading) return <Loading what="people" />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  return (
    <div className="space-y-3">
      <input className="ce-input w-full" placeholder="Search name, email, department" value={search} onChange={(e) => setSearch(e.target.value)} />
      {rows.map((r) => (
        <Card key={r.id}>
          <button className="flex min-h-11 w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span>
              <span className="block font-semibold text-ink">{r.full_name}</span>
              <span className="block text-xs text-soft">{r.email ?? "no login"} · {r.role} · {r.status}{r.disabled ? " · disabled" : ""}</span>
            </span>
            <span className="text-soft">{open === r.id ? "−" : "+"}</span>
          </button>
          {open === r.id && <UserEditor row={r} all={q.data.rows} />}
        </Card>
      ))}
      {q.data.orphans.length > 0 && (
        <Card>
          <h3 className="font-semibold text-ink">Logins with no profile</h3>
          {q.data.orphans.map((o) => (
            <div key={o.id} className="mt-2 text-sm text-soft break-all">{o.email ?? o.id} · last sign-in {o.last_sign_in_at ? new Date(o.last_sign_in_at).toLocaleString() : "never"}</div>
          ))}
        </Card>
      )}
    </div>
  );
}

function UserEditor({ row, all }: { row: UserRow; all: UserRow[] }) {
  const qc = useQueryClient();
  const update = useServerFn(devUpdateProfile);
  const action = useServerFn(devUserAction);
  const [f, setF] = useState({
    title: row.title ?? "", department: row.department ?? "", role: row.role, status: row.status, manager_id: row.manager_id ?? "",
  });
  const [link, setLink] = useState<string | null>(null);
  const [pw, setPw] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const patch: Record<string, string | null> = {};
      if (f.title !== (row.title ?? "")) patch["title"] = f.title || null;
      if (f.department !== (row.department ?? "")) patch["department"] = f.department || null;
      if (f.role !== row.role) patch["role"] = f.role;
      if (f.status !== row.status) patch["status"] = f.status;
      if (f.manager_id !== (row.manager_id ?? "")) patch["manager_id"] = f.manager_id || null;
      if (!Object.keys(patch).length) throw new Error("Nothing changed");
      return update({ data: { id: row.id, patch } });
    },
    onSuccess: () => { toast.success("Saved"); void qc.invalidateQueries({ queryKey: ["dev-users"] }); void qc.invalidateQueries({ queryKey: ["dev-overview"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const act = useMutation({
    mutationFn: (a: "recovery_link" | "set_password" | "disable" | "enable" | "unlink") =>
      action({ data: { action: a, profileId: row.id, origin: window.location.origin, ...(a === "set_password" ? { password: pw } : {}) } }),
    onSuccess: (res, a) => {
      if (res.link) setLink(res.link);
      if (a === "set_password") setPw("");
      toast.success("Done");
      void qc.invalidateQueries({ queryKey: ["dev-users"] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const manager = all.find((p) => p.id === row.manager_id);
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
      <div className="grid gap-1 text-soft break-all">
        <span>Last sign-in: {row.last_sign_in_at ? new Date(row.last_sign_in_at).toLocaleString() : "never"}</span>
        <span>Invited: {row.invited_at ? new Date(row.invited_at).toLocaleDateString() : "—"}</span>
        <span>Email confirmed: {row.email_confirmed ? "yes" : "no"}</span>
        <span>Manager: {manager?.full_name ?? "—"}</span>
        <span>Profile id: {row.id}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="ce-input" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input className="ce-input" placeholder="Department" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
        <select className="ce-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {["member", "manager", "hr", "admin"].map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className="ce-input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          {["active", "exited"].map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className="ce-input sm:col-span-2" value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
          <option value="">Reports to: nobody</option>
          {all.filter((p) => p.id !== row.id).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>
      <button className="btn3d w-full sm:w-auto" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>

      {row.auth_user_id ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn3d btn3d-ghost" disabled={act.isPending} onClick={() => act.mutate("recovery_link")}>Make reset link</button>
            <button className="btn3d btn3d-ghost" disabled={act.isPending} onClick={() => act.mutate(row.disabled ? "enable" : "disable")}>{row.disabled ? "Enable login" : "Disable login"}</button>
            <button className="btn3d btn3d-ghost" disabled={act.isPending} onClick={() => { if (confirm(`Unlink the login from ${row.full_name}?`)) act.mutate("unlink"); }}>Unlink login</button>
          </div>
          {link && <textarea readOnly className="ce-input w-full text-xs" rows={3} value={link} onFocus={(e) => e.currentTarget.select()} />}
          <div className="flex flex-wrap gap-2">
            <input className="ce-input flex-1" type="password" placeholder="New password (8+ chars)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button className="btn3d btn3d-ghost" disabled={act.isPending || pw.length < 8} title={pw.length < 8 ? "At least 8 characters" : undefined} onClick={() => act.mutate("set_password")}>Set password</button>
          </div>
        </div>
      ) : (
        <p className="text-soft">No login linked.</p>
      )}
      <IdDocs row={row} />
      <ImpersonatePerson row={row} />
    </div>
  );
}

/** The card as base64: photos shrunk on the device, PDFs as they are. */
async function cardData(file: File): Promise<{ mime: string; data: string }> {
  const blob: Blob = file.type.startsWith("image/") ? await resizeImage(file, 2000) : file;
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { mime: blob.type || file.type, data: url.slice(url.indexOf(",") + 1) };
}

/** PAN and Aadhaar are locked for the person after they submit; developers, like HR, can still change them. */
function IdDocs({ row }: { row: UserRow }) {
  const qc = useQueryClient();
  const load = useServerFn(devIdDocs);
  const saveFn = useServerFn(devSaveIdDocs);
  const q = useQuery({ queryKey: ["dev-id-docs", row.id], queryFn: () => load({ data: { profileId: row.id } }) });
  const [pan, setPan] = useState<string | null>(null);
  const [last4, setLast4] = useState<string | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const panValue = pan ?? q.data?.pan_number ?? "";
  const last4Value = last4 ?? q.data?.aadhaar_last4 ?? "";

  const save = useMutation({
    mutationFn: async () => {
      const input: Parameters<typeof saveFn>[0]["data"] = { profileId: row.id };
      if (pan !== null && pan !== (q.data?.pan_number ?? "")) input.pan_number = pan || null;
      if (last4 !== null && last4 !== (q.data?.aadhaar_last4 ?? "")) input.aadhaar_last4 = last4 || null;
      if (panFile) input.pan_doc = await cardData(panFile);
      if (aadhaarFile) input.aadhaar_doc = await cardData(aadhaarFile);
      if (Object.keys(input).length === 1) throw new Error("Nothing changed");
      return saveFn({ data: input });
    },
    onSuccess: () => {
      toast.success("PAN and Aadhaar saved");
      setPan(null); setLast4(null); setPanFile(null); setAadhaarFile(null);
      void qc.invalidateQueries({ queryKey: ["dev-id-docs", row.id] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isLoading) return <p className="border-t border-border pt-3 text-soft">Loading PAN and Aadhaar…</p>;
  if (q.error) return <p className="border-t border-border pt-3 text-soft">Couldn't load PAN and Aadhaar: {errMsg(q.error)}</p>;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <h4 className="font-semibold text-ink">PAN and Aadhaar</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="ce-input" placeholder="PAN number" value={panValue}
          onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} />
        <input className="ce-input" inputMode="numeric" placeholder="Aadhaar — last 4 digits" value={last4Value}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <div>
          <FilePicker label="Upload new PAN card" accept="image/*,application/pdf" maxBytes={7 * 1024 * 1024} onSelect={setPanFile} />
          {q.data?.panUrl && <a className="text-xs font-bold text-goldD underline" href={q.data.panUrl} target="_blank" rel="noopener noreferrer">View current PAN</a>}
        </div>
        <div>
          <FilePicker label="Upload new Aadhaar" accept="image/*,application/pdf" maxBytes={7 * 1024 * 1024} onSelect={setAadhaarFile} />
          {q.data?.aadhaarUrl && <a className="text-xs font-bold text-goldD underline" href={q.data.aadhaarUrl} target="_blank" rel="noopener noreferrer">View current Aadhaar</a>}
        </div>
      </div>
      <button className="btn3d w-full sm:w-auto" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save PAN and Aadhaar"}</button>
    </div>
  );
}

function ImpersonatePerson({ row }: { row: UserRow }) {
  const generate = useServerFn(devImpersonateLink);
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reason = impersonationBlockedReason(row);
  const request = useMutation({
    mutationFn: () => generate({ data: { profileId: row.id, redirectTo: `${window.location.origin}/dashboard` } }),
    retry: false,
    onSuccess: (value) => { setLink(value); setCopied(false); void qc.invalidateQueries({ queryKey: ["dev-audit"] }); },
    onError: (error) => toast.error(errMsg(error)),
  });
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { toast.error("Couldn't copy. Select the link and copy it manually."); }
  }
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Button variant="ghost" className="btn3d btn3d-ghost min-h-12 w-full sm:w-auto" disabled={Boolean(reason) || request.isPending} onClick={() => setConfirmOpen(true)}>
        {request.isPending ? "Creating link…" : "Open as this person"}
      </Button>
      {reason && <p className="text-sm text-soft">{reason}</p>}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-[24px] border-border bg-card sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">Open as this person?</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-soft">
              You'll see the app exactly as {row.full_name} ({row.role}). Anything you do there is done as them. Open the link in a private/incognito window so your own session stays signed in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="btn3d btn3d-ghost min-h-12">Cancel</AlertDialogCancel>
            <AlertDialogAction className="btn3d min-h-12" onClick={() => { setLink(null); setCopied(false); request.mutate(); }}>Create sign-in link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {link && !reason && (
        <div className="min-w-0 space-y-2">
          <textarea aria-label={`Sign-in link for ${row.full_name}`} readOnly className="ce-input w-full min-w-0 text-base break-all" rows={3} value={link} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ghost" className="btn3d btn3d-ghost min-h-12 w-full sm:w-auto" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>
            <Button variant="ghost" className="btn3d btn3d-ghost min-h-12 w-full sm:w-auto" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open in new tab</a>
            </Button>
          </div>
          <p className="text-sm text-soft">Use a private/incognito window to keep your own session signed in.</p>
        </div>
      )}
    </div>
  );
}
