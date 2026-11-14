#!/usr/bin/env bash
# Publish a still article project into docs/<slug>/ for the GitHub Pages site.
#
# Usage: scripts/publish-example.sh <project-dir> <slug> [title]
#
# Builds the project with the subpath base Pages serves it from
# (/moonshine/<slug>/), patches the static <title>, adds the SPA 404
# fallback, and syncs the result into docs/<slug>/. Afterwards: add a card
# for the example to docs/index.html, commit docs/, and push main to deploy.
#
# A project whose large assets are hosted elsewhere records that in
# <project-dir>/moonshine.publish.json, so the publish is repeatable:
#
#   { "env":     { "VITE_MAP_ASSETS": "https://example.com/assets/map" },
#     "exclude": ["map/"] }
#
# "env" is exported for the build; "exclude" paths (relative to dist/) are
# left out of docs/<slug>/. The script reports the published size and stops
# above MOONSHINE_PUBLISH_MAX_MB (default 50): Pages is not the place for a
# few hundred megabytes of tiles.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <project-dir> <slug> [title]" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
project_dir="$(cd "$1" && pwd)"
slug="$2"
title="${3:-}"

case "$slug" in
  '' | *[!a-z0-9-]*)
    echo "slug must be non-empty kebab-case (a-z, 0-9, -), got: '$slug'" >&2
    exit 1
    ;;
esac

cd "$project_dir"
[ -d node_modules ] || npm install

excludes=()
if [ -f moonshine.publish.json ]; then
  while IFS= read -r line; do
    export "$line"
    echo "publish env: ${line%%=*}"
  done < <(python3 -c 'import json; c = json.load(open("moonshine.publish.json")); [print(f"{k}={v}") for k, v in c.get("env", {}).items()]')
  while IFS= read -r line; do
    excludes+=(--exclude "/$line")
    echo "publish exclude: $line"
  done < <(python3 -c 'import json; c = json.load(open("moonshine.publish.json")); [print(x.lstrip("/")) for x in c.get("exclude", [])]')
fi
# npm appends extra args to the script line, which ends in `vite build`.
# BrowserRouter picks the base up via import.meta.env.BASE_URL.
npm run build -- --base="/moonshine/$slug/"

# The article sets document.title at runtime; the static <title> in
# dist/index.html is what search results and link unfurls see. Derive it
# from the content frontmatter for a single article; series projects pass
# the title explicitly.
if [ -z "$title" ]; then
  md_count=$(find content -maxdepth 2 -name '*.md' | wc -l)
  if [ "$md_count" -eq 1 ]; then
    title=$(grep -m1 '^title:' content/*.md \
      | sed 's/^title:[[:space:]]*//; s/^["'\'']//; s/["'\'']$//')
  fi
fi
if [ -n "$title" ]; then
  python3 - "$title" dist/index.html <<'PY'
import re, sys
title, path = sys.argv[1], sys.argv[2]
s = open(path).read()
s = re.sub(r"<title>.*?</title>", lambda m: f"<title>{title}</title>", s, count=1)
open(path, "w").write(s)
PY
else
  echo "warning: no title derived — dist/index.html keeps the template <title>" >&2
fi

# Check the size before touching docs/, so an oversized build never lands.
max_mb="${MOONSHINE_PUBLISH_MAX_MB:-50}"
size_tmp="$(mktemp -d)"
size_kb=$(rsync -a --dry-run --stats ${excludes[@]+"${excludes[@]}"} dist/ "$size_tmp/" \
  | sed -n 's/^Total file size: \([0-9,]*\) bytes.*/\1/p' | tr -d ',' | awk '{ printf "%d", $1 / 1024 }')
rmdir "$size_tmp"
size_kb="${size_kb:-0}"
echo "publish size: $((size_kb / 1024)) MB ($size_kb KB). Largest files in dist/:"
find dist -type f -printf '%s %P\n' | sort -rn | head -5 | awk '{ printf "  %8.1f KB  %s\n", $1 / 1024, $2 }'
if [ "$size_kb" -gt $((max_mb * 1024)) ]; then
  echo "error: would publish more than ${max_mb} MB into docs/$slug/." >&2
  echo "Host large assets elsewhere and list them under \"exclude\" in moonshine.publish.json," >&2
  echo "or raise MOONSHINE_PUBLISH_MAX_MB if this size is intended." >&2
  exit 1
fi

mkdir -p "$repo_root/docs/$slug"
rsync -a --delete --delete-excluded ${excludes[@]+"${excludes[@]}"} dist/ "$repo_root/docs/$slug/"

# GitHub Pages only serves a custom 404 from the site root, so per-slug
# 404 files never fire. A root docs/404.html redirects a deep link like
# /moonshine/<slug>/<article> to /moonshine/<slug>/?/<article>; the
# template's index.html decodes the ?/ back into the real path before
# the app boots (the rafgraph/spa-github-pages pattern). Idempotent —
# safe to rewrite on every publish.
cat > "$repo_root/docs/404.html" <<'HTML'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Moonshine</title>
    <script>
      // Keep /moonshine/<slug>/ and pack the rest into ?/ for the SPA
      // to restore. pathSegmentsToKeep = 2 (project pages: /moonshine/ + slug).
      var segments = 2
      var l = window.location
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + segments).join('/') + '/?/' +
        l.pathname.split('/').slice(1 + segments).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      )
    </script>
  </head>
  <body></body>
</html>
HTML

echo "Published to docs/$slug/."
echo "Next: add a card to docs/index.html, then commit docs/ and push main."
