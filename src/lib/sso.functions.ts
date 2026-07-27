import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseSsoReturnAllowlist, resolveAllowedReturnOrigin } from "@/lib/sso-allowlist";
import { hashSsoCode, requireSsoSecret } from "@/lib/sso-crypto";

const MintSchema = z.object({
  returnTo: z.string().url().max(2000),
  accessToken: z.string().min(20).max(16_000),
  refreshToken: z.string().min(10).max(16_000),
});

export const mintSsoHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MintSchema.parse(input))
  .handler(async ({ data, context }) => {
    const allowlist = parseSsoReturnAllowlist(process.env.SSO_RETURN_ALLOWLIST);
    if (allowlist.size === 0) {
      throw new Error(
        "SSO er ikke konfigurert (SSO_RETURN_ALLOWLIST mangler). Se docs/IDENTITY_CORE.md.",
      );
    }
    requireSsoSecret();

    const returnOrigin = resolveAllowedReturnOrigin(data.returnTo, allowlist);
    if (!returnOrigin) {
      throw new Error("return_to er ikke på allowlisten.");
    }

    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const probe = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: claimsData, error: claimsErr } = await probe.auth.getClaims(data.accessToken);
    if (claimsErr || claimsData?.claims?.sub !== context.userId) {
      throw new Error("Ugyldig access_token for SSO-handoff.");
    }

    const code = randomBytes(32).toString("base64url");
    const codeHash = hashSsoCode(code);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("sso_handoff_codes").insert({
      code_hash: codeHash,
      user_id: context.userId,
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
      return_origin: returnOrigin,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    const redirectUrl = `${returnOrigin}/auth/callback?code=${encodeURIComponent(code)}`;
    return { ok: true as const, code, redirectUrl, returnOrigin };
  });
