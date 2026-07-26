import assert from "node:assert/strict";
import { describe, it } from "node:test";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateConnectionInput(input) {
  const org = (input.external_org_id ?? "").trim();
  const url = (input.external_base_url ?? "").trim();
  if (!uuidRe.test(org)) return { ok: false, error: "Organisasjon-ID må være en gyldig UUID" };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Base URL må være en gyldig URL (inkl. https://)" };
    }
  } catch {
    return { ok: false, error: "Base URL må være en gyldig URL (inkl. https://)" };
  }
  return { ok: true };
}

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, "");
}

describe("Nexus module connection input", () => {
  it("accepts uuid + https URL", () => {
    const res = validateConnectionInput({
      external_org_id: "11111111-1111-4111-8111-111111111111",
      external_base_url: "https://finance.example.com/",
    });
    assert.equal(res.ok, true);
  });

  it("rejects missing uuid", () => {
    const res = validateConnectionInput({
      external_org_id: "not-a-uuid",
      external_base_url: "https://finance.example.com",
    });
    assert.equal(res.ok, false);
  });

  it("normalizes trailing slash on base URL", () => {
    assert.equal(normalizeBaseUrl("https://work.example.com/"), "https://work.example.com");
  });
});
