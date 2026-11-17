import { describe, it as test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { fitWithin, prettySize, renameFor, shrinkForUpload, unshrink } from "./shrinkFile";

describe("shrinking uploads", () => {
  test("images fit in 2560px, never scaled up", () => {
    deepEqual(fitWithin(4000, 3000, 2560), { w: 2560, h: 1920 });
    deepEqual(fitWithin(1080, 2400, 2560), { w: 1080, h: 2400 });
  });
  test("re-saved images get the right extension", () => {
    equal(renameFor("shot.png", "image/webp"), "shot.webp");
    equal(renameFor("photo.JPEG", "image/jpeg"), "photo.jpg");
    equal(renameFor("form.pdf", "application/pdf"), "form.pdf");
  });
  test("small files are stored as they are", async () => {
    const f = new File(["hello"], "a.txt", { type: "text/plain" });
    const s = await shrinkForUpload(f, "text/plain");
    equal(s.encoding, null);
    equal(s.blob, f);
  });
  test("documents are gzipped and come back byte for byte", async () => {
    const text = "Strategic Meeting 5.0 weekly counts, 0 pending. ".repeat(20000);
    const f = new File([text], "notes.txt", { type: "text/plain" });
    const s = await shrinkForUpload(f, "text/plain");
    equal(s.encoding, "gzip");
    equal(s.storedMime, "application/gzip");
    ok(s.blob.size < f.size / 10);
    const back = await unshrink(s.blob, s.encoding, s.mime);
    ok(back.type.startsWith("text/plain"));
    deepEqual(new Uint8Array(await back.arrayBuffer()), new Uint8Array(await f.arrayBuffer()));
  });
  test("already-compressed data is kept as the original", async () => {
    const random = new Uint8Array(400 * 1024).map(() => Math.floor(Math.random() * 256));
    const f = new File([random], "x.pdf", { type: "application/pdf" });
    const s = await shrinkForUpload(f, "application/pdf");
    equal(s.encoding, null);
    equal(s.blob, f);
  });
  test("sizes read well", () => {
    equal(prettySize(1536), "2KB");
    equal(prettySize(3 * 1024 * 1024), "3.0MB");
  });
});
