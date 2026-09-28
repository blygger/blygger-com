#!/bin/bash
# Re-copy the resolution modules from the reference client, blygger-studio.
#
# Source moved at session 26 (2026-09-28): the client was split out of
# blygger-spec/worker/ into its own repo and renamed blyg-ref -> blygger-studio.
#
# The directory validates submissions by running the SAME resolver a blyg client
# runs (self-host-plan.md §7). Separate repo, separate deployment, so the code is
# vendored rather than imported — and vendored code drifts silently, which is the
# one thing this script exists to prevent: re-run it, and `git diff` shows you
# exactly what changed upstream.
#
# Do not edit anything under src/vendor/ by hand.
set -e
SRC="$(cd "$(dirname "$0")/../../blygger-studio/src" && pwd)"
DEST="$(cd "$(dirname "$0")/../src/vendor" && pwd)"

header() {
  printf '// VENDORED from blygger-studio/src/%s — do not edit here.\n// Re-sync with scripts/sync-vendor.sh. See self-host-plan.md §7.\n\n' "$1"
}

for f in importer/resolve.ts importer/feed.ts importer/http.ts; do
  out="$DEST/$(basename "$f")"
  header "$f" > "$out"
  cat "$SRC/$f" >> "$out"
  echo "  $f -> src/vendor/$(basename "$f")"
done

# feed.ts imports toIsoUtc from ../util.ts; vendor just that function's module
# path by rewriting the import to a local shim.
sed -i '' 's#from "../util.ts"#from "./util.ts"#' "$DEST/feed.ts"

# http.ts imports GENERATOR from ../types.ts to build its User-Agent. Point that
# at the shim too, which defines the DIRECTORY's identity rather than the
# client's — blygger.com is not a blyg client and should not claim to be one.
sed -i '' 's#from "../types.ts"#from "./util.ts"#' "$DEST/http.ts"
sed -i '' 's#(+https://blygger.org)#(+https://blygger.com)#' "$DEST/http.ts"
echo "Done. Review with: git diff src/vendor/"
