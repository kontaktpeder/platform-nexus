/** Parse comma/semicolon-separated recipient lists. */
export function parseEmailList(raw: string): string[] {
  const emails =
    raw.match(/[\w.+-]+@[\w.-]+\.\w+/g)?.map((e) => e.toLowerCase()) ?? [];
  return [...new Set(emails)];
}

export function formatEmailList(emails: string[]): string {
  return [...new Set(emails.map((e) => e.toLowerCase()))].join(", ");
}

export function isValidEmailList(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return parseEmailList(trimmed).length > 0;
}
