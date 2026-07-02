export function parseGmailMessageIdFromKey(key: string): string | null {
  if (!key.startsWith("gmail:")) return null;
  const id = key.slice("gmail:".length);
  return id.length ? id : null;
}
