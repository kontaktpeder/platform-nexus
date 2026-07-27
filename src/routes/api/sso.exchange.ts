import { createFileRoute } from "@tanstack/react-router";
import { hashSsoCode } from "@/lib/sso-crypto";
import { parseSsoReturnAllowlist } from "@/lib/sso-allowlist";

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowlist = parseSsoReturnAllowlist(process.env.SSO_RETURN_ALLOWLIST);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin && allowlist.has(origin.replace(/\/$/, ""))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export const Route = createFileRoute("/api/sso/exchange")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const headers = {
          ...corsHeaders(request),
          "Content-Type": "application/json",
        };

        let body: { code?: unknown };
        try {
          body = (await request.json()) as { code?: unknown };
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers,
          });
        }

        const code = typeof body.code === "string" ? body.code.trim() : "";
        if (!code || code.length > 200) {
          return new Response(JSON.stringify({ error: "Missing code" }), {
            status: 400,
            headers,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const codeHash = hashSsoCode(code);
        const { data: row, error } = await (supabaseAdmin as any)
          .from("sso_handoff_codes")
          .select("id, access_token, refresh_token, user_id, expires_at, consumed_at, return_origin")
          .eq("code_hash", codeHash)
          .maybeSingle();

        if (error || !row) {
          return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
            status: 400,
            headers,
          });
        }
        if (row.consumed_at) {
          return new Response(JSON.stringify({ error: "Code already used" }), {
            status: 400,
            headers,
          });
        }
        if (new Date(row.expires_at as string).getTime() < Date.now()) {
          return new Response(JSON.stringify({ error: "Code expired" }), {
            status: 400,
            headers,
          });
        }

        const { error: consumeErr } = await (supabaseAdmin as any)
          .from("sso_handoff_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", row.id)
          .is("consumed_at", null);
        if (consumeErr) {
          return new Response(JSON.stringify({ error: "Could not consume code" }), {
            status: 500,
            headers,
          });
        }

        return new Response(
          JSON.stringify({
            access_token: row.access_token,
            refresh_token: row.refresh_token,
            user_id: row.user_id,
            return_origin: row.return_origin,
          }),
          { status: 200, headers },
        );
      },
    },
  },
});
