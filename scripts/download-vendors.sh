#!/usr/bin/env bash
# download-vendors.sh
# Fetches all vendor assets required by jarvis.html into dashboard/public/vendor/
# Run once after cloning, or whenever you want to refresh pinned versions.

set -euo pipefail

VENDOR_DIR="$(dirname "$0")/../dashboard/public/vendor"
mkdir -p "$VENDOR_DIR"

GLOBE_VERSION="2.33.0"
THREE_GLOBE_VERSION="2.33.0"

echo "[1/3] Downloading globe.gl@${GLOBE_VERSION}..."
curl -fsSL "https://unpkg.com/globe.gl@${GLOBE_VERSION}/dist/globe.gl.min.js" \
  -o "$VENDOR_DIR/globe.gl.min.js"
echo "      -> $VENDOR_DIR/globe.gl.min.js"

echo "[2/3] Downloading earth-night.jpg from three-globe@${THREE_GLOBE_VERSION}..."
curl -fsSL "https://unpkg.com/three-globe@${THREE_GLOBE_VERSION}/example/img/earth-night.jpg" \
  -o "$VENDOR_DIR/earth-night.jpg"
echo "      -> $VENDOR_DIR/earth-night.jpg"

echo "[3/3] Downloading earth-topology.png from three-globe@${THREE_GLOBE_VERSION}..."
curl -fsSL "https://unpkg.com/three-globe@${THREE_GLOBE_VERSION}/example/img/earth-topology.png" \
  -o "$VENDOR_DIR/earth-topology.png"
echo "      -> $VENDOR_DIR/earth-topology.png"

echo ""
echo "Done. All vendor assets saved to: $VENDOR_DIR"
echo "Three.js is bundled inside globe.gl.min.js and exposed as window.THREE."
