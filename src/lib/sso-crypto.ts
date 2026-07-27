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
    throw new Error("SSO_CODE_SECRET (eller MODULE_SECRETS_KEY) mangler.");
  }
  return secret;
}

export function hashSsoCode(code: string): string {
  return createHash("sha256").update(`${ssoSecret()}:${code}`).digest("hex");
}
