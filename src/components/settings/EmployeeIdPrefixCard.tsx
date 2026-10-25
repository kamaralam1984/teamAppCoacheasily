import { toast } from "sonner";
import { useEffect, useState } from "react";

import { useOrgSettings, useSaveOrgSettings } from "@/hooks/useOrg";

const DEFAULT_PREFIX = "CE";
const SHAPE = /^[A-Za-z0-9]{1,8}$/;

/** The letters in front of the next employee id. Ids already given stay as they are. */
export function EmployeeIdPrefixCard() {
  const { data: settings } = useOrgSettings();
  const save = useSaveOrgSettings();
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);

  useEffect(() => {
    if (!settings) return;
    setPrefix(settings.employee_code_prefix?.trim() || DEFAULT_PREFIX);
  }, [settings]);

  const clean = prefix.trim();
  const valid = SHAPE.test(clean);

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Employee id prefix</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        A person added without an id gets the next number after this prefix. Ids people already
        have do not change.
      </p>

      <label className="mt-4 block">
        <span className="ce-label">Prefix</span>
        <input
          className="ce-input mt-1 w-40"
          value={prefix}
          maxLength={8}
          onChange={(e) => setPrefix(e.target.value)}
        />
      </label>
      <p className="mt-2 text-[13px] text-soft">
        {valid ? `The next new person gets ${clean}-…` : "Use 1 to 8 letters or digits, no spaces."}
      </p>

      <button
        type="button"
        className="btn3d mt-4"
        disabled={save.isPending || !valid}
        onClick={() =>
          save.mutate(
            { employee_code_prefix: clean },
            {
              onSuccess: () => toast.success("Saved."),
              onError: (e) => toast.error((e as Error).message || "That didn't save."),
            },
          )
        }
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
