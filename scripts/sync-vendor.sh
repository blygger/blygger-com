#!/bin/bash
# Re-copy the resolution modules from blygger-spec's reference client.
#
# The directory validates submissions by running the SAME resolver a blyg client
# runs (self-host-plan.md §7). Separate repo, separate deployment, so the code is
# vendored rather than imported — and vendored code drifts silently, which is the
# one thing this script exists to prevent: re-run it, and `git diff` shows you
# exactly what changed upstream.
#
# Do not edit anything under src/vendor/ by hand.
set -e
SRC="$(cd "$(dirname "$0")/../../blygger-spec/worker/src" && pwd)"
DEST="$(cd "$(dirname "$0")/../src/vendor" && pwd)"

header() {
  printf '// VENDORED from blygger-spec/worker/src/%s — do not edit here.\n// Re-sync with scripts/sync-vendor.sh. See self-host-plan.md §7.\n\n' "$1"
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
echo "Done. Review with: git diff src/vendor/"
