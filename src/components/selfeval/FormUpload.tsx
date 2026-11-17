import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { docxToText } from "@/lib/docxText";
import { readSelfEvaluationForm } from "@/lib/selfEvaluation.functions";
import {
  errorText,
  readableKind,
  readCount,
  uploadMime,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_BYTES,
  type ReadForm,
} from "@/lib/selfEvaluation";

const READ_MAX_BYTES = 4 * 1024 * 1024;

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsDataURL(file);
  });
}

/**
 * Upload the filled form (PDF, Word, photo…). It is kept with the self-evaluation, and when it
 * can be read the boxes found in it are offered to fill the form: only the empty boxes, or all.
 */
export function FormUpload({
  canFill,
  onUpload,
  onApply,
  uploading,
  applying,
}: {
  /** the form can still be filled (otherwise the file is only kept) */
  canFill: boolean;
  onUpload: (file: File) => Promise<unknown>;
  onApply: (read: ReadForm, mode: "empty" | "replace") => Promise<void>;
  uploading: boolean;
  applying: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const read = useServerFn(readSelfEvaluationForm);
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<{ name: string; form: ReadForm } | null>(null);

  async function pick(file: File) {
    const mime = uploadMime(file.name, file.type);
    if (!mime) {
      toast.error("That file type can't be uploaded. Use PDF, Word, Excel, CSV or an image.");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      toast.error("That file is over 20MB.");
      return;
    }
    try {
      await onUpload(file);
      toast.success(`${file.name} uploaded.`);
    } catch (e) {
      toast.error(errorText(e, "The upload failed. Please try again."));
      return;
    }
    if (!canFill) return;
    const kind = readableKind(mime);
    if (!kind) {
      toast.message(
        "Kept with your form. Only PDF, Word, text and image files can fill the boxes.",
      );
      return;
    }
    setReading(true);
    try {
      let res;
      if (kind === "file") {
        if (file.size > READ_MAX_BYTES)
          throw new Error("Kept, but it is too large to read (4MB at most).");
        res = await read({ data: { mime, data: await toBase64(file) } });
      } else {
        const text = kind === "docx" ? await docxToText(file) : await file.text();
        res = await read({ data: { text } });
      }
      if (!res.form || readCount(res.form) === 0) {
        toast.error(res.error ?? "Nothing could be read from that file. Fill the form by hand.");
        return;
      }
      setFound({ name: file.name, form: res.form });
    } catch (e) {
      toast.error(errorText(e, "The file could not be read."));
    } finally {
      setReading(false);
    }
  }

  const f = found?.form;
  return (
    <section className="ce-card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-display text-xl text-ink">Upload your filled form</h2>
          <p className="text-sm text-soft">
            {canFill
              ? "Filled the form in Word or as a PDF? Upload it: it is kept with your self-evaluation and the boxes below fill themselves. Check them before you submit."
              : "Upload the filled or signed form. It is kept with this self-evaluation."}
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pick(file);
          }}
        />
        <button
          type="button"
          className="btn3d btn3d-gold"
          disabled={uploading || reading || applying}
          onClick={() => input.current?.click()}
        >
          <Upload className="mr-1 inline h-4 w-4" />
          {uploading ? "Uploading…" : reading ? "Reading the form…" : "Upload form"}
        </button>
      </div>
      <p className="text-[12px] text-soft">
        PDF, Word, Excel, CSV or an image, up to 20MB. Files are made smaller before they are saved,
        without losing quality.
      </p>

      {f ? (
        <div className="rounded-lg border border-gold bg-gold/10 p-3">
          <p className="text-sm font-bold text-ink">
            <Wand2 className="mr-1 inline h-4 w-4" />
            Found in {found!.name}: {f.goals.length} goals, {Object.keys(f.value_answers).length} of
            12 values, {Object.keys(f.reflection).length} of 6 reflection answers,{" "}
            {Object.keys(f.potential).length} of 4 potential answers.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn3d btn3d-gold"
              disabled={applying}
              onClick={() =>
                void onApply(f, "empty").then(() => {
                  setFound(null);
                })
              }
            >
              Fill the empty boxes
            </button>
            <button
              type="button"
              className="btn3d"
              disabled={applying}
              onClick={() =>
                void onApply(f, "replace").then(() => {
                  setFound(null);
                })
              }
            >
              Replace with the upload
            </button>
            <button type="button" className="btn3d btn3d-ghost" onClick={() => setFound(null)}>
              Don't fill
            </button>
          </div>
          <p className="mt-2 text-[12px] text-soft">
            <FileText className="mr-1 inline h-3 w-3" />
            "Fill the empty boxes" keeps everything you already typed. "Replace" takes the upload's
            answers wherever it has one.
          </p>
        </div>
      ) : null}
    </section>
  );
}
