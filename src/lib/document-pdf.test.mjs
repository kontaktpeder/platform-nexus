import assert from "node:assert/strict";
import test from "node:test";

// Lightweight mirror of parseDocumentBody for node tests without pdf-lib.
// Keep in sync with src/lib/document-pdf.ts section/time/bullet rules.

function isSectionHeader(line) {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (/^[-*•]/.test(t)) return false;
  if (/^\d{1,2}[:.]\d{2}/.test(t)) return false;
  const letters = t.replace(/[^A-Za-zÆØÅæøå]/g, "");
  if (letters.length >= 4) {
    const upper = letters.toUpperCase();
    const lower = letters.toLowerCase();
    if (letters === upper && letters !== lower) return true;
  }
  if (/^[A-ZÆØÅ].+:$/.test(t) && !t.includes(" – ") && !t.includes(" - ")) {
    return true;
  }
  return false;
}

const TIME_RE =
  /^(\d{1,2}[:.]\d{2}(?:\s*[–—-]\s*\d{1,2}[:.]\d{2})?)\s*[–—:-]\s+(.+)$/;

function parseDocumentBody(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let skippedTitle = false;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!skippedTitle && blocks.length === 0 && isSectionHeader(trimmed) && trimmed.length > 20) {
      skippedTitle = true;
      if (/KJØREPLAN|BRIEFING|DOKUMENT/i.test(trimmed) && !trimmed.endsWith(":")) {
        continue;
      }
    }

    if (isSectionHeader(trimmed)) {
      blocks.push({ kind: "section", title: trimmed.replace(/:$/, "").trim() });
      continue;
    }

    const timeMatch = trimmed.match(TIME_RE);
    if (timeMatch) {
      blocks.push({
        kind: "timeline",
        time: timeMatch[1].replace(/\./g, ":").replace(/\s+/g, " "),
        text: timeMatch[2].trim(),
      });
      continue;
    }

    const bullet = trimmed.match(/^([-*•]|\*)\s+(.+)$/);
    const indentedSub = line.match(/^\s{2,}([-*•*]|\*)\s+(.+)$/);
    if (indentedSub) {
      blocks.push({ kind: "bullet", text: indentedSub[2].trim(), depth: 1 });
      continue;
    }
    if (bullet) {
      blocks.push({ kind: "bullet", text: bullet[2].trim(), depth: 0 });
      continue;
    }

    blocks.push({ kind: "para", text: trimmed });
  }

  return blocks;
}

test("parseDocumentBody structures kjøreplan", () => {
  const body = `KJØREPLAN OG BRIEFING – MARIT OG AASMUND (JOSEFINE)

Kontaktinformasjon:
- Brudepar: Marit og Aasmund
- Vipps: 95186266

TIDSLINJE FOR DAGEN:
09:00 – Opprigg innendørs
14:00 – 14:45 – Mottakelse i hagen
  * 17:00: Forrett

ROLLER OG ANSVARSFORDELING:
- Peder: Totalansvar
`;

  const blocks = parseDocumentBody(body);
  const kinds = blocks.map((b) => b.kind);
  assert.ok(kinds.includes("section"));
  assert.ok(kinds.includes("timeline"));
  assert.ok(kinds.includes("bullet"));

  const times = blocks.filter((b) => b.kind === "timeline");
  assert.equal(times[0].time, "09:00");
  assert.match(times[0].text, /Opprigg/);
  assert.equal(times[1].time, "14:00 – 14:45");

  const sections = blocks.filter((b) => b.kind === "section").map((b) => b.title);
  assert.ok(sections.some((s) => /Kontakt/i.test(s)));
  assert.ok(sections.some((s) => /TIDSLINJE/i.test(s)));
});
