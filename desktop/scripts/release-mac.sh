#!/bin/bash
# Build Mac installers and upload to GitHub release
# Run from desktop/ directory on Mac

set -e

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"
ARCH=$(uname -m)

if [ "$ARCH" = "arm64" ]; then
  RID="mac-arm64"
  EB_ARCH="--arm64"
  ARCH_NAME="arm64"
else
  RID="mac-x64"
  EB_ARCH="--x64"
  ARCH_NAME="x64"
fi

echo "Building Whamail ${VERSION} for macOS ${ARCH_NAME}..."

# Build everything
npm run api:publish:${RID}
npm run electron:build:next
npm run electron:build:main
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac ${EB_ARCH} --publish never

DMG="dist/Whamail-${VERSION}-${ARCH_NAME}.dmg"
ZIP="dist/Whamail-${VERSION}-${ARCH_NAME}.zip"
LATEST_MAC="dist/latest-mac.yml"

if [ ! -f "$DMG" ]; then
  echo "ERROR: $DMG not found"
  exit 1
fi

# Remove quarantine
xattr -cr "$DMG" "$ZIP" 2>/dev/null || true

echo "Built: $DMG"
echo "Uploading to release ${TAG}..."

# Upload DMG to main release
gh release upload "$TAG" "$DMG" --clobber

# Upload auto-update files to autoupdate release
gh release create autoupdate --title "Auto-Update Files" --prerelease --notes "Internal auto-update files. Do not download manually." 2>/dev/null || true
gh release upload autoupdate "$ZIP" "$LATEST_MAC" --clobber

echo "Done! macOS ${ARCH_NAME} release uploaded."
