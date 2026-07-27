import { createHash } from "node:crypto";

function ssoSecret(): string {
  return (
    process.env.SSO_CODE_SECRET?.trim() ||
    process.env.MODULE_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

export function requireSsoSecret(): string {
  const secret = ssoSecret();
  if (!secret) {
    // Last resort so SSO works before secrets are wired on Lovable Cloud.
    console.warn("[SSO] Using ephemeral SSO code secret fallback");
    return "core-sso-dev-fallback-change-me";
  }
  return secret;
}

export function hashSsoCode(code: string): string {
  const secret =
    ssoSecret() || "core-sso-dev-fallback-change-me";
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}
