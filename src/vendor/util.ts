// Shim for the two helpers the vendored resolver reaches for. Kept separate
// from sync-vendor.sh's copies because blygger-spec's util.ts carries a lot the
// directory does not need; only these cross the boundary.
//
// Source of truth for toIsoUtc: blygger-spec/worker/src/util.ts.

/** Normalize any RFC-822 / RFC-3339 / offset-bearing date to ISO-8601 UTC. */
export function toIsoUtc(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
