// Server-only: read module connection secrets (verify + optional invoices key).
import { decryptSecret } from "@/lib/module-secrets.server";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export type ModuleConnectionSecrets = {
  verifyApiKey: string;
  invoicesApiKey: string;
  hasInvoicesKey: boolean;
};

export async function getModuleConnectionSecrets(
  supabaseAdmin: AdminClient,
  connectionId: string,
): Promise<ModuleConnectionSecrets | null> {
  const { data: sec } = await supabaseAdmin
    .from("module_connection_secrets")
    .select("api_key_ciphertext, invoices_api_key_ciphertext")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (!sec?.api_key_ciphertext) return null;

  const verifyApiKey = decryptSecret(sec.api_key_ciphertext);
  const hasInvoicesKey = !!sec.invoices_api_key_ciphertext;
  const invoicesApiKey = hasInvoicesKey
    ? decryptSecret(sec.invoices_api_key_ciphertext as string)
    : verifyApiKey;

  return { verifyApiKey, invoicesApiKey, hasInvoicesKey };
}
