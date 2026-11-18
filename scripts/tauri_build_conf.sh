#!/usr/bin/env bash
# Дополнение к tauri.conf.json для сборки в CI (печатает JSON для `tauri build --config`):
# - версия из тега vX.Y.Z или коммита «Релиз vX.Y.Z» — чтобы обновление сравнивалось с версией релиза;
# - файлы обновления (.sig), если в секретах есть ключ подписи TAURI_SIGNING_PRIVATE_KEY.
set -euo pipefail
updater=false
[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && updater=true
version=""
case "${GITHUB_REF:-}" in refs/tags/v*) version="${GITHUB_REF_NAME#v}" ;; esac
# Коммит «Релиз vX.Y.Z» в main — тоже релиз (тег ставит job «Релиз»).
if [ -z "$version" ] && [ "${GITHUB_REF:-}" = "refs/heads/main" ]; then
  version=$(printf '%s' "${HEAD_MESSAGE:-}" | head -n1 | sed -n 's/^Релиз v\([0-9][0-9.]*\).*/\1/p')
fi
if [ "${1:-}" = "--version" ]; then
  printf '%s\n' "$version"
  exit 0
fi
if [ -n "$version" ]; then
  printf '{"version":"%s","bundle":{"createUpdaterArtifacts":%s}}\n' "$version" "$updater"
else
  printf '{"bundle":{"createUpdaterArtifacts":%s}}\n' "$updater"
fi
