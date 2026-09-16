export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 128-bit random id, base36. Same scheme as the reference client's item ids
 * (decision #2): stable, random, never derived from content.
 */
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let n = 0n;
  for (const byte of b) n = (n << 8n) | BigInt(byte);
  return n.toString(36).padStart(25, "0");
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
