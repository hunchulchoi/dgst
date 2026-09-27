#!/usr/bin/env bash
set -euo pipefail

service="${1:-dgst_svelte}"
source_dir="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
archive_dir="$source_dir/.immutable-history"
stage_dir="$(mktemp -d "$source_dir/.immutable-history-stage.XXXXXX")"
trap 'rm -rf "$stage_dir"' EXIT

# Docker copies preserve mtimes, allowing old builds to age out of the archive.
docker cp "$service:/app/client/_app/immutable/." "$stage_dir/"
find "$stage_dir" -type f \( -name '*.br' -o -name '*.gz' \) -delete

if ! find "$stage_dir" -type f -print -quit | grep -q .; then
  echo "No client assets found in $service" >&2
  exit 1
fi

mkdir -p "$archive_dir"
cp -an "$stage_dir/." "$archive_dir/"
find "$archive_dir" -type f -mtime +30 ! -name .gitkeep -delete
find "$archive_dir" -mindepth 1 -type d -empty -delete
