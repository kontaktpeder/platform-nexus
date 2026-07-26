import { createFileRoute } from "@tanstack/react-router";

/**
 * Same-origin company logo proxy.
 * Browser never needs VITE_/LOGO keys — Lovable Secrets LOGO_DEV_PUBLISHABLE_KEY
 * stays server-only. Upstream: Logo.dev (Clearbit shut down).
 */
export const Route = createFileRoute("/api/logo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = (url.searchParams.get("domain") ?? "").trim().toLowerCase();
        const host = raw
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0]
          .replace(/[^a-z0-9.-]/g, "");
        if (!host || !host.includes(".") || host.length > 253) {
          return new Response(null, { status: 400 });
        }

        const sizeRaw = Number(url.searchParams.get("size") ?? "128");
        const size = Number.isFinite(sizeRaw)
          ? Math.min(512, Math.max(32, Math.round(sizeRaw)))
          : 128;

        const token = process.env.LOGO_DEV_PUBLISHABLE_KEY?.trim() ?? "";
        if (!token) {
          return new Response(null, { status: 404 });
        }

        const upstreamUrl = `https://img.logo.dev/${encodeURIComponent(host)}?${new URLSearchParams(
          {
            token,
            size: String(size),
            format: "png",
          },
        ).toString()}`;

        const upstream = await fetch(upstreamUrl, {
          headers: { Accept: "image/*" },
        });
        if (!upstream.ok) {
          return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
        }

        const contentType = upstream.headers.get("Content-Type") ?? "image/png";
        const body = await upstream.arrayBuffer();
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        });
      },
    },
  },
});
