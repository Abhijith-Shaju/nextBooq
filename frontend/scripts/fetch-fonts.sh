#!/usr/bin/env bash
# Re-downloads the self-hosted font files under src/app/fonts/.
#
# Fonts are self-hosted (see src/app/layout.tsx) so `next dev`/`next build`
# never depend on reaching fonts.gstatic.com at build time. This script is
# only needed if a font family or weight changes — normal dev/build does
# not run it.
#
# Requires network access to Google Fonts (one-time, at edit time only).
set -euo pipefail

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/app/fonts"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
CSS_URL="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&display=swap"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

curl -sL -A "$UA" "$CSS_URL" -o /tmp/nextbooq-fonts.css

# Prints the woff2 URL of the first "latin" (not latin-ext/cyrillic/etc.)
# @font-face block for a given family + weight. Google serves one URL per
# variable-font family regardless of requested weight (Inter, Space Grotesk),
# and one URL per static weight for non-variable families (Space Mono) — this
# works for both since it just returns whatever URL that block has.
url_for() {
  local family="$1" weight="$2"
  awk -v family="$family" -v weight="$weight" '
    /\/\* latin \*\// { latin_next = 1; next }
    /^@font-face/ { if (latin_next) { in_block = 1; is_latin = 1 }; latin_next = 0 }
    in_block { block = block $0 "\n" }
    /^}/ {
      if (in_block && is_latin) {
        if (block ~ ("font-family: .*" family) && block ~ ("font-weight: " weight ";")) {
          n = split(block, lines, "\n")
          for (i = 1; i <= n; i++) {
            if (lines[i] ~ /src: url\(/) {
              line = lines[i]
              sub(/.*url\(/, "", line)
              sub(/\).*/, "", line)
              print line
              exit
            }
          }
        }
      }
      in_block = 0; is_latin = 0; block = ""
    }
  ' /tmp/nextbooq-fonts.css
}

echo "Fetching Inter (variable, latin)..."
curl -sL "$(url_for Inter 400)" -o inter-variable.woff2

echo "Fetching Space Grotesk (variable, latin)..."
curl -sL "$(url_for 'Space Grotesk' 500)" -o space-grotesk-variable.woff2

echo "Fetching Space Mono 400 (latin)..."
curl -sL "$(url_for 'Space Mono' 400)" -o space-mono-400.woff2

echo "Fetching Space Mono 700 (latin)..."
curl -sL "$(url_for 'Space Mono' 700)" -o space-mono-700.woff2

rm -f /tmp/nextbooq-fonts.css
ls -la "$OUT_DIR"
echo "Done. Verify each file with: file *.woff2"
