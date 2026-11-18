#!/usr/bin/env bash
# Дополнение к tauri.conf.json для сборки в CI (печатает JSON для `tauri build --config`):
# - версия из тега vX.Y.Z — чтобы обновление сравнивалось с версией релиза;
# - файлы обновления (.sig), если в секретах есть ключ подписи TAURI_SIGNING_PRIVATE_KEY.
set -euo pipefail
updater=false
[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && updater=true
version=""
case "${GITHUB_REF:-}" in refs/tags/v*) version="${GITHUB_REF_NAME#v}" ;; esac
if [ -n "$version" ]; then
  printf '{"version":"%s","bundle":{"createUpdaterArtifacts":%s}}\n' "$version" "$updater"
else
  printf '{"bundle":{"createUpdaterArtifacts":%s}}\n' "$updater"
fi
