/**
 * Report exports with no libraries: CSV, Excel (.xlsx) and PDF.
 *
 * The .xlsx is a real Office Open XML package (a zip of a few XML files, stored without
 * compression). The PDF is a plain PDF 1.4 using the built-in Helvetica fonts, so it needs no
 * font files; characters outside Latin-1 and the usual punctuation print as "?".
 * Nothing here touches the DOM except downloadBytes(), so the builders can be tested in Node.
 */

export interface ExportColumn {
  key: string;
  label: string;
}
export type ExportRow = Record<string, string | number | boolean | null | undefined>;

export function cellText(value: ExportRow[string]): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

// ───────────────────────── CSV ─────────────────────────

function csvCell(value: string): string {
  // A cell that starts like a formula would run when opened in a spreadsheet; keep it text.
  const safe = /^[=+@]/.test(value) || /^-(?![\d.])/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const BOM = String.fromCharCode(0xfeff);

export function buildCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(cellText(row[c.key]))).join(","));
  }
  // The BOM makes Excel read the file as UTF-8.
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

// ───────────────────────── ZIP (stored) ─────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ (bytes[i] as number)) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

export function buildZip(
  files: { name: string; data: Uint8Array }[],
  now = new Date(),
): Uint8Array {
  const enc = new TextEncoder();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const header = Uint8Array.from([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(dosTime),
      ...u16(dosDate),
      ...u32(crc),
      ...u32(f.data.length),
      ...u32(f.data.length),
      ...u16(name.length),
      ...u16(0),
    ]);
    chunks.push(header, name, f.data);
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(dosTime),
      ...u16(dosDate),
      ...u32(crc),
      ...u32(f.data.length),
      ...u32(f.data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    );
    offset += header.length + name.length + f.data.length;
  }

  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0),
  ];
  const total = offset + central.length + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(central, pos);
  out.set(end, pos + central.length);
  return out;
}

// ───────────────────────── XLSX ─────────────────────────

function xmlEscape(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetName(title: string): string {
  const cleaned = title
    .replace(/[[\]:*?/\\]/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Report";
}

export function buildXlsx(title: string, columns: ExportColumn[], rows: ExportRow[]): Uint8Array {
  const enc = new TextEncoder();
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const widths = columns.map((c, i) => {
    let longest = c.label.length;
    for (const row of rows) longest = Math.max(longest, cellText(row[c.key]).length);
    return Math.min(Math.max(longest + 2, 8), 60) + (i === 0 ? 2 : 0);
  });
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  const headerCells = columns
    .map(
      (c, i) =>
        `<c r="${columnLetters(i)}1" t="inlineStr" s="1"><is><t>${xmlEscape(c.label)}</t></is></c>`,
    )
    .join("");
  const bodyRows = rows
    .map((row, r) => {
      const cells = columns
        .map((c, i) => {
          const ref = `${columnLetters(i)}${r + 2}`;
          const v = row[c.key];
          if (v === null || v === undefined || v === "") return "";
          if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cellText(v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");

  const sheet =
    `${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData><row r="1">${headerCells}</row>${bodyRows}</sheetData></worksheet>`;

  const files = [
    {
      name: "[Content_Types].xml",
      text:
        `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      text:
        `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      text:
        `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${xmlEscape(sheetName(title))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text:
        `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      text:
        `${head}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FFFBF7EC"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    },
    { name: "xl/worksheets/sheet1.xml", text: sheet },
  ];

  return buildZip(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}

// ───────────────────────── PDF ─────────────────────────

/** Characters outside Latin-1 that Windows-1252 (what the PDF font uses) does have. */
const WIN_ANSI: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
  "→": 0x2d,
  "←": 0x2d,
};

function winAnsiText(text: string): string {
  let out = "";
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    const code = ch.codePointAt(0) as number;
    if (code >= 32 && code <= 126) out += ch;
    else if (code >= 160 && code <= 255) out += ch;
    else if (WIN_ANSI[ch] !== undefined) out += String.fromCharCode(WIN_ANSI[ch] as number);
    else out += "?";
  }
  return out;
}

/** Rough Helvetica widths in 1/1000 em: good enough to size columns and wrap text. */
function charWidth(ch: string, bold: boolean): number {
  const c = ch.charCodeAt(0);
  let w: number;
  if (ch === " ") w = 278;
  else if ("ijl.,:;'|!".includes(ch)) w = 250;
  else if ("ftr()[]-/\\".includes(ch)) w = 333;
  else if ("mwMW".includes(ch)) w = ch === "m" ? 833 : ch === "w" ? 722 : 833;
  else if (c >= 48 && c <= 57) w = 556;
  else if (c >= 65 && c <= 90) w = 667;
  else if (c >= 97 && c <= 122) w = 520;
  else w = 556;
  return bold ? w * 1.06 : w;
}

function textWidth(text: string, size: number, bold = false): number {
  let sum = 0;
  for (const ch of text) sum += charWidth(ch, bold);
  return (sum * size) / 1000;
}

function wrap(
  text: string,
  maxWidth: number,
  size: number,
  bold: boolean,
  maxLines: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // a single long word is cut to fit
    let rest = word;
    while (textWidth(rest, size, bold) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${(kept[maxLines - 1] as string).replace(/.{1,2}$/, "")}...`;
    return kept;
  }
  return lines.length ? lines : [""];
}

function pdfString(s: string): string {
  let out = "(";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (c < 32 || c > 126) out += `\\${c.toString(8).padStart(3, "0")}`;
    else out += ch;
  }
  return `${out})`;
}

export function buildPdf(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  generatedOn = new Date(),
): Uint8Array {
  const landscape = columns.length > 6;
  const W = landscape ? 842 : 595;
  const H = landscape ? 595 : 842;
  const M = 36;
  const usable = W - M * 2;
  const SIZE = 8;
  const LINE = 10.5;

  // Column widths: as wide as the content wants (capped), then scaled to the page.
  const want = columns.map((c) => {
    let w = textWidth(winAnsiText(c.label), SIZE, true) + 10;
    for (const row of rows.slice(0, 200)) {
      w = Math.max(w, Math.min(textWidth(winAnsiText(cellText(row[c.key])), SIZE) + 10, 190));
    }
    return Math.max(w, 36);
  });
  const sum = want.reduce((a, b) => a + b, 0);
  const widths = want.map((w) => (w * usable) / Math.max(sum, usable));
  const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));

  type Page = string[];
  const pages: Page[] = [];
  let page: Page = [];
  let y = H - M;

  const text = (x: number, yy: number, s: string, size: number, bold: boolean) =>
    `BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(s)} Tj ET`;

  const newPage = () => {
    page = [];
    pages.push(page);
    y = H - M;
  };

  const drawHeader = () => {
    const lines = columns.map((c, i) =>
      wrap(winAnsiText(c.label), (widths[i] as number) - 8, SIZE, true, 2),
    );
    const height = Math.max(...lines.map((l) => l.length)) * LINE + 6;
    page.push("0.984 0.969 0.925 rg");
    page.push(`${M} ${(y - height).toFixed(2)} ${usable} ${height.toFixed(2)} re f`);
    page.push("0.14 0.11 0.2 rg");
    lines.forEach((ls, i) =>
      ls.forEach((l, k) => page.push(text((xs[i] as number) + 4, y - 9 - k * LINE, l, SIZE, true))),
    );
    y -= height;
  };

  newPage();
  page.push("0.14 0.11 0.2 rg");
  page.push(text(M, y - 14, winAnsiText(title), 16, true));
  y -= 26;
  if (subtitle) {
    for (const l of wrap(winAnsiText(subtitle), usable, 9, false, 4)) {
      page.push("0.43 0.4 0.5 rg");
      page.push(text(M, y - 9, l, 9, false));
      y -= 12;
    }
  }
  y -= 8;
  drawHeader();

  rows.forEach((row, rowIndex) => {
    const cells = columns.map((c, i) =>
      wrap(winAnsiText(cellText(row[c.key])), (widths[i] as number) - 8, SIZE, false, 3),
    );
    const height = Math.max(...cells.map((l) => l.length)) * LINE + 5;
    if (y - height < M + 18) {
      newPage();
      drawHeader();
    }
    if (rowIndex % 2 === 1) {
      page.push("0.99 0.98 0.95 rg");
      page.push(`${M} ${(y - height).toFixed(2)} ${usable} ${height.toFixed(2)} re f`);
    }
    page.push("0.14 0.11 0.2 rg");
    cells.forEach((ls, i) =>
      ls.forEach((l, k) =>
        page.push(text((xs[i] as number) + 4, y - 9 - k * LINE, l, SIZE, false)),
      ),
    );
    page.push("0.94 0.91 0.83 RG 0.4 w");
    page.push(`${M} ${(y - height).toFixed(2)} m ${M + usable} ${(y - height).toFixed(2)} l S`);
    y -= height;
  });

  if (rows.length === 0) {
    page.push("0.43 0.4 0.5 rg");
    page.push(text(M + 4, y - 12, "No rows.", 9, false));
  }

  // footer on every page, now that the count is known
  const stamp = winAnsiText(
    `Generated ${generatedOn.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
  );
  pages.forEach((p, i) => {
    p.push("0.43 0.4 0.5 rg");
    p.push(text(M, 20, stamp, 7, false));
    const label = `Page ${i + 1} of ${pages.length}`;
    p.push(text(W - M - textWidth(label, 7), 20, label, 7, false));
  });

  // objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then (page, content) pairs
  const objects: string[] = [];
  const pageObjIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((p, i) => {
    const content = p.join("\n");
    objects[5 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objects[6 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Title ${pdfString(winAnsiText(title))} >> >>\nstartxref\n${xref}\n%%EOF\n`;

  const out = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i += 1) out[i] = body.charCodeAt(i) & 0xff;
  return out;
}

// ───────────────────────── download (browser only) ─────────────────────────

export const MIME = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

export function downloadBytes(filename: string, bytes: Uint8Array | string, mime: string) {
  const part = typeof bytes === "string" ? bytes : (bytes.slice().buffer as ArrayBuffer);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(title: string, ext: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report";
  return `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
