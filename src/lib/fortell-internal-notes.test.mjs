import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

function noteSearchTokens(query) {
  const raw = query
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^a-z0-9æøå:.-]+/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const stop = new Set([
    "og", "i", "på", "til", "fra", "av", "den", "det", "de", "en", "et",
    "som", "skal", "når", "hva", "hvor", "om", "med", "for", "ikke",
    "sjekk", "notatene", "notater", "interne", "har", "gjort", "dette",
    "her", "finne", "finnes", "noe", "mailer", "mail", "slack",
  ]);
  const out = [];
  const seen = new Set();
  for (const t of raw) {
    if (stop.has(t)) continue;
    if (t.length < 2) continue;
    if (t.length < 3 && !/^\d{1,2}:\d{2}$/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

function scoreText(text, tokens) {
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length >= 5 ? 3 : 2;
  }
  return score;
}

test("tokens keep Henrik/omrigg/august", () => {
  const tokens = noteSearchTokens(
    "Når er det Henrik skal rygge opp anlegget fra hagen sjekk notatene bryllupet 15 august",
  );
  assert.ok(tokens.includes("henrik"));
  assert.ok(tokens.includes("hagen") || tokens.includes("anlegget"));
  assert.ok(tokens.includes("bryllupet") || tokens.includes("august"));
});

test("desk kjøreplan matches omrigg line", async () => {
  const text = await readFile(
    path.join(process.cwd(), "public/docs/kjoreplan-josefine.txt"),
    "utf8",
  );
  const tokens = noteSearchTokens("Henrik omrigg hagen middagsområdet");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => /16:15/.test(l) && /omrigg/i.test(l));
  assert.ok(hit);
  assert.ok(scoreText(hit, tokens) > 0);
  assert.match(hit, /16:15/);
});
