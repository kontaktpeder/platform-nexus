// Server-only. MVP-kryptering med env-nøkkel. Bytt til AES-GCM senere.
// Aldri importer denne filen fra klientkode.

const ENC_KEY_ENV = "MODULE_SECRETS_KEY";

function keyBuffer(): Buffer | null {
  const key = process.env[ENC_KEY_ENV];
  if (!key) {
    console.warn(`[module-secrets] ${ENC_KEY_ENV} mangler — bruker base64 fallback (KUN DEV)`);
    return null;
  }
  return Buffer.from(key, "utf8");
}

export function encryptSecret(plain: string): string {
  const kb = keyBuffer();
  const pb = Buffer.from(plain, "utf8");
  if (!kb) return pb.toString("base64");
  const out = Buffer.alloc(pb.length);
  for (let i = 0; i < pb.length; i++) out[i] = pb[i] ^ kb[i % kb.length];
  return out.toString("base64");
}

export function decryptSecret(cipher: string): string {
  const kb = keyBuffer();
  const buf = Buffer.from(cipher, "base64");
  if (!kb) return buf.toString("utf8");
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ kb[i % kb.length];
  return out.toString("utf8");
}
