#!/usr/bin/env bash
# Publish a still article project into docs/<slug>/ for the GitHub Pages site.
#
# Usage: scripts/publish-example.sh <project-dir> <slug> [title]
#
# Builds the project with the subpath base Pages serves it from
# (/moonshine/<slug>/), patches the static <title>, adds the SPA 404
# fallback, and syncs the result into docs/<slug>/. Afterwards: add a card
# for the example to docs/index.html, commit docs/, and push main to deploy.
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
  *[!a-z0-9-]*)
    echo "slug must be kebab-case (a-z, 0-9, -), got: $slug" >&2
    exit 1
    ;;
esac

cd "$project_dir"
[ -d node_modules ] || npm install
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

# GitHub Pages serves 404.html for unknown paths; a copy of index.html
# makes deep links into the SPA (e.g. /moonshine/<slug>/<article>) work.
cp dist/index.html dist/404.html

mkdir -p "$repo_root/docs/$slug"
rsync -a --delete dist/ "$repo_root/docs/$slug/"

echo "Published to docs/$slug/."
echo "Next: add a card to docs/index.html, then commit docs/ and push main."
