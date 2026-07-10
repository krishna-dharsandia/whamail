#!/bin/bash
# Build Windows installer and upload to GitHub release
# Run from desktop/ directory on Windows

set -e

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

echo "Building Whamail ${VERSION} for Windows..."

# Build everything
npm run api:publish:win
npm run electron:build:next
npm run electron:build:main
npx electron-builder --win --x64 --publish never

EXE="dist/Whamail-Setup-${VERSION}-x64.exe"
LATEST_YML="dist/latest.yml"

if [ ! -f "$EXE" ]; then
  echo "ERROR: $EXE not found"
  exit 1
fi

echo "Built: $EXE"
echo "Uploading to release ${TAG}..."

# Upload installer to main release
gh release upload "$TAG" "$EXE" --clobber

# Upload auto-update files to autoupdate release
gh release create autoupdate --title "Auto-Update Files" --prerelease --notes "Internal auto-update files. Do not download manually." 2>/dev/null || true
gh release upload autoupdate "$EXE" "$LATEST_YML" --clobber

echo "Done! Windows release uploaded."
