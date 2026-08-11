/**
 * Client-side PDF for Fortell — real .pdf download with Noto Sans (æøå).
 */

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 52;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const ink = rgb(0.07, 0.09, 0.11);
const muted = rgb(0.35, 0.38, 0.42);
const rule = rgb(0.82, 0.84, 0.86);
const accent = rgb(0.06, 0.4, 0.38);
const timeCol = rgb(0.12, 0.35, 0.34);

export type DocBlock =
  | { kind: "section"; title: string }
  | { kind: "para"; text: string }
  | { kind: "bullet"; text: string; depth: 0 | 1 }
  | { kind: "timeline"; time: string; text: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Detect section headers like "KONTAKT:" or "Tidslinje for dagen" */
function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (/^[-*•]/.test(t)) return false;
  if (/^\d{1,2}[:.]\d{2}/.test(t)) return false;
  // ALL CAPS (allow æøå and punctuation)
  const letters = t.replace(/[^A-Za-zÆØÅæøå]/g, "");
  if (letters.length >= 4) {
    const upper = letters.toUpperCase();
    const lower = letters.toLowerCase();
    if (letters === upper && letters !== lower) return true;
  }
  // Title case ending with colon
  if (/^[A-ZÆØÅ].+:$/.test(t) && !t.includes(" – ") && !t.includes(" - ")) {
    return true;
  }
  return false;
}

const TIME_RE =
  /^(\d{1,2}[:.]\d{2}(?:\s*[–—-]\s*\d{1,2}[:.]\d{2})?)\s*[–—:-]\s+(.+)$/;

export function parseDocumentBody(body: string): DocBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let skippedTitle = false;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip a first line that duplicates the document title (often ALL CAPS)
    if (!skippedTitle && blocks.length === 0 && isSectionHeader(trimmed) && trimmed.length > 20) {
      skippedTitle = true;
      // Still treat as section only if it looks like a real section later;
      // long ALL-CAPS title lines are skipped once.
      if (/KJØREPLAN|BRIEFING|DOKUMENT/i.test(trimmed) && !trimmed.endsWith(":")) {
        continue;
      }
    }

    if (isSectionHeader(trimmed)) {
      blocks.push({
        kind: "section",
        title: trimmed.replace(/:$/, "").trim(),
      });
      continue;
    }

    const timeMatch = trimmed.match(TIME_RE);
    if (timeMatch) {
      blocks.push({
        kind: "timeline",
        time: timeMatch[1]!.replace(/\./g, ":").replace(/\s+/g, " "),
        text: timeMatch[2]!.trim(),
      });
      continue;
    }

    const bullet = trimmed.match(/^([-*•]|\*)\s+(.+)$/);
    const indentedSub = line.match(/^\s{2,}([-*•*]|\*)\s+(.+)$/);
    if (indentedSub) {
      blocks.push({ kind: "bullet", text: indentedSub[2]!.trim(), depth: 1 });
      continue;
    }
    if (bullet) {
      blocks.push({ kind: "bullet", text: bullet[2]!.trim(), depth: 0 });
      continue;
    }

    // Continuation of previous timeline/bullet as paragraph if short indent
    blocks.push({ kind: "para", text: trimmed });
  }

  return blocks;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      // Hard-break very long tokens
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          const tryChunk = chunk + ch;
          if (font.widthOfTextAtSize(tryChunk, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = tryChunk;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

type DrawCtx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pageIndex: number;
};

function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.y - needed >= MARGIN_BOTTOM) return;
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageIndex += 1;
  ctx.y = PAGE_H - MARGIN_TOP;
  // subtle page marker
  ctx.page.drawText(`Nexus · ${ctx.pageIndex + 1}`, {
    x: MARGIN_X,
    y: 28,
    size: 8,
    font: ctx.regular,
    color: muted,
  });
}

function drawRule(ctx: DrawCtx): void {
  ensureSpace(ctx, 14);
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_W - MARGIN_X, y: ctx.y },
    thickness: 0.8,
    color: rule,
  });
  ctx.y -= 14;
}

async function buildPdfBytes(input: {
  title: string;
  body: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const [regBytes, boldBytes] = await Promise.all([
    fetch("/fonts/NotoSans-Regular.ttf").then((r) => {
      if (!r.ok) throw new Error("Kunne ikke laste font (Regular)");
      return r.arrayBuffer();
    }),
    fetch("/fonts/NotoSans-Bold.ttf").then((r) => {
      if (!r.ok) throw new Error("Kunne ikke laste font (Bold)");
      return r.arrayBuffer();
    }),
  ]);

  const regular = await pdfDoc.embedFont(regBytes);
  const bold = await pdfDoc.embedFont(boldBytes);

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = {
    doc: pdfDoc,
    page,
    y: PAGE_H - MARGIN_TOP,
    regular,
    bold,
    pageIndex: 0,
  };

  // Brand strip
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - 8,
    width: PAGE_W,
    height: 8,
    color: accent,
  });

  const title = input.title.trim() || "Dokument";
  const titleSize = 18;
  const titleLines = wrapText(title, bold, titleSize, CONTENT_W);
  for (const line of titleLines) {
    ensureSpace(ctx, titleSize + 6);
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: ctx.y - titleSize,
      size: titleSize,
      font: bold,
      color: ink,
    });
    ctx.y -= titleSize + 4;
  }

  const date = new Date().toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  ensureSpace(ctx, 22);
  ctx.page.drawText(`Nexus  ·  ${date}`, {
    x: MARGIN_X,
    y: ctx.y - 10,
    size: 9,
    font: regular,
    color: muted,
  });
  ctx.y -= 18;
  drawRule(ctx);
  ctx.y -= 6;

  const blocks = parseDocumentBody(input.body);
  const bodySize = 10.5;
  const lineGap = 3.5;

  for (const block of blocks) {
    if (block.kind === "section") {
      ctx.y -= 10;
      const size = 11.5;
      ensureSpace(ctx, size + 20);
      ctx.page.drawText(block.title.toUpperCase(), {
        x: MARGIN_X,
        y: ctx.y - size,
        size,
        font: bold,
        color: accent,
      });
      ctx.y -= size + 4;
      ctx.page.drawLine({
        start: { x: MARGIN_X, y: ctx.y },
        end: { x: MARGIN_X + Math.min(140, bold.widthOfTextAtSize(block.title, size)), y: ctx.y },
        thickness: 1.4,
        color: accent,
      });
      ctx.y -= 12;
      continue;
    }

    if (block.kind === "timeline") {
      const timeSize = 10;
      const timeW = 88;
      const textX = MARGIN_X + timeW + 10;
      const textW = CONTENT_W - timeW - 10;
      const textLines = wrapText(block.text, regular, bodySize, textW);
      const blockH = Math.max(timeSize, textLines.length * (bodySize + lineGap)) + 8;
      ensureSpace(ctx, blockH);

      // Time column
      ctx.page.drawText(block.time, {
        x: MARGIN_X,
        y: ctx.y - timeSize,
        size: timeSize,
        font: bold,
        color: timeCol,
      });

      let ty = ctx.y;
      for (const tl of textLines) {
        ctx.page.drawText(tl, {
          x: textX,
          y: ty - bodySize,
          size: bodySize,
          font: regular,
          color: ink,
        });
        ty -= bodySize + lineGap;
      }
      ctx.y = Math.min(ctx.y - timeSize - 8, ty - 4);
      continue;
    }

    if (block.kind === "bullet") {
      const indent = block.depth === 0 ? 0 : 16;
      const bulletX = MARGIN_X + indent;
      const textX = bulletX + 14;
      const textW = CONTENT_W - indent - 14;
      const textLines = wrapText(block.text, regular, bodySize, textW);
      const blockH = textLines.length * (bodySize + lineGap) + 4;
      ensureSpace(ctx, blockH);

      const mark = block.depth === 0 ? "•" : "–";
      ctx.page.drawText(mark, {
        x: bulletX,
        y: ctx.y - bodySize,
        size: bodySize,
        font: bold,
        color: accent,
      });

      let ty = ctx.y;
      for (const tl of textLines) {
        ctx.page.drawText(tl, {
          x: textX,
          y: ty - bodySize,
          size: bodySize,
          font: regular,
          color: ink,
        });
        ty -= bodySize + lineGap;
      }
      ctx.y = ty - 2;
      continue;
    }

    // para
    const textLines = wrapText(block.text, regular, bodySize, CONTENT_W);
    const blockH = textLines.length * (bodySize + lineGap) + 6;
    ensureSpace(ctx, blockH);
    for (const tl of textLines) {
      ctx.page.drawText(tl, {
        x: MARGIN_X,
        y: ctx.y - bodySize,
        size: bodySize,
        font: regular,
        color: ink,
      });
      ctx.y -= bodySize + lineGap;
    }
    ctx.y -= 4;
  }

  // Footer on first page
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: PAGE_W - MARGIN_X - 36,
      y: 28,
      size: 8,
      font: regular,
      color: muted,
    });
    if (i === 0) {
      p.drawText("Nexus", {
        x: MARGIN_X,
        y: 28,
        size: 8,
        font: regular,
        color: muted,
      });
    }
  });

  return pdfDoc.save();
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function slugifyFilename(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "dokument"}.pdf`;
}

/** Download a real .pdf file (Mac/PC). */
export async function downloadDocumentPdf(input: {
  title: string;
  body: string;
  filename?: string;
}): Promise<void> {
  const bytes = await buildPdfBytes(input);
  triggerDownload(bytes, input.filename || slugifyFilename(input.title));
}

function bodyToStructuredHtml(body: string): string {
  const blocks = parseDocumentBody(body);
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "section") {
      parts.push(`<h2>${escapeHtml(b.title)}</h2>`);
    } else if (b.kind === "timeline") {
      parts.push(
        `<div class="row"><span class="time">${escapeHtml(b.time)}</span><span class="desc">${escapeHtml(b.text)}</span></div>`,
      );
    } else if (b.kind === "bullet") {
      const cls = b.depth === 0 ? "li" : "li sub";
      parts.push(`<div class="${cls}">${escapeHtml(b.text)}</div>`);
    } else {
      parts.push(`<p>${escapeHtml(b.text)}</p>`);
    }
  }
  return parts.join("\n");
}

function buildPrintDocumentHtml(title: string, body: string): string {
  const safeTitle = escapeHtml(title.trim() || "Dokument");
  const structured = bodyToStructuredHtml(body);
  const date = escapeHtml(new Date().toLocaleDateString("nb-NO"));
  return `<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    @page { margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #fff !important; color: #121417 !important; }
    body {
      font-family: "Noto Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .brand-bar { height: 6px; background: #0f766e; }
    main { padding: 1.75rem 1.5rem 2.5rem; max-width: 44rem; margin: 0 auto; }
    h1 {
      margin: 0 0 0.35rem;
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
      color: #121417;
    }
    .meta { margin: 0 0 1rem; color: #5c6570; font-size: 0.85rem; }
    hr.rule { border: 0; border-top: 1px solid #d5d9de; margin: 0 0 1.25rem; }
    h2 {
      margin: 1.4rem 0 0.55rem;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0f766e;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 0.25rem;
      display: inline-block;
      min-width: 8rem;
    }
    .row {
      display: grid;
      grid-template-columns: 6.5rem 1fr;
      gap: 0.65rem;
      padding: 0.35rem 0;
      align-items: start;
      border-bottom: 1px solid #eef0f2;
    }
    .time {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #0f5f58;
      font-size: 0.95rem;
    }
    .desc { color: #1a1d21; }
    .li {
      position: relative;
      padding: 0.28rem 0 0.28rem 1.1rem;
      color: #1a1d21;
    }
    .li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #0f766e;
      font-weight: 700;
    }
    .li.sub { padding-left: 2rem; color: #2c333a; }
    .li.sub::before { content: "–"; left: 1rem; }
    p { margin: 0.4rem 0; color: #1a1d21; }
    @media print { .no-print { display: none !important; } }
    .no-print {
      position: sticky; top: 0; z-index: 2;
      display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
      padding: 0.75rem 1rem; background: #f4f5f6; border-bottom: 1px solid #ddd;
      font-size: 13px; color: #18181b;
    }
    .no-print button {
      cursor: pointer; border: 0; border-radius: 8px;
      padding: 0.45rem 0.85rem; background: #0f766e; color: #fff; font-weight: 600;
    }
    .no-print button.secondary { background: #e4e4e7; color: #18181b; }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" id="print-btn">Skriv ut / lagre PDF</button>
    <button type="button" class="secondary" id="close-btn">Lukk</button>
    <span>Foretrukket: bruk «Last ned PDF» i Nexus for direkte .pdf-fil.</span>
  </div>
  <div class="brand-bar"></div>
  <main>
    <h1>${safeTitle}</h1>
    <p class="meta">Nexus · ${date}</p>
    <hr class="rule" />
    ${structured}
  </main>
  <script>
    document.getElementById("print-btn").addEventListener("click", function () { window.print(); });
    document.getElementById("close-btn").addEventListener("click", function () { window.close(); });
  </script>
</body>
</html>`;
}

/**
 * Open a print-ready preview (fallback). Prefer downloadDocumentPdf.
 */
export function openDocumentPdfWindow(input: {
  title: string;
  body: string;
}): boolean {
  const html = buildPrintDocumentHtml(input.title, input.body);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}
