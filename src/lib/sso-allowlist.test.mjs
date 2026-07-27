import { describe, it } from "node:test";
import assert from "node:assert/strict";

function parseSsoReturnAllowlist(raw) {
  const set = new Set();
  for (const part of (raw ?? "").split(",")) {
    const trimmed = part.trim().replace(/\/$/, "");
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      set.add(`${u.protocol}//${u.host}`);
    } catch {
      /* skip */
    }
  }
  return set;
}

function resolveAllowedReturnOrigin(returnTo, allowlist) {
  let url;
  try {
    url = new URL(returnTo);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const origin = `${url.protocol}//${url.host}`;
  if (!allowlist.has(origin)) return null;
  return origin;
}

describe("sso-allowlist", () => {
  it("parses origins and strips trailing slashes", () => {
    const set = parseSsoReturnAllowlist(
      "https://finance.example.com/, http://localhost:3001, not-a-url, ftp://bad.com",
    );
    assert.equal(set.has("https://finance.example.com"), true);
    assert.equal(set.has("http://localhost:3001"), true);
    assert.equal(set.size, 2);
  });

  it("accepts allowlisted return_to with path", () => {
    const set = parseSsoReturnAllowlist("https://finance.example.com");
    assert.equal(
      resolveAllowedReturnOrigin("https://finance.example.com/auth", set),
      "https://finance.example.com",
    );
  });

  it("rejects unknown origins", () => {
    const set = parseSsoReturnAllowlist("https://finance.example.com");
    assert.equal(resolveAllowedReturnOrigin("https://evil.example.com", set), null);
  });
});
