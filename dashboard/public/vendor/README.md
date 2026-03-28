# Vendor Assets

This directory contains locally pinned third-party scripts and assets used by `jarvis.html`.
No build step is required — these files are served statically by the Express server.

## Files (run `scripts/download-vendors.sh` to fetch)

| File | Source | Version |
|------|--------|---------|
| `globe.gl.min.js` | https://unpkg.com/globe.gl@2.33.0 | 2.33.0 |
| `earth-night.jpg` | https://unpkg.com/three-globe@2.33.0/example/img/earth-night.jpg | 2.33.0 |
| `earth-topology.png` | https://unpkg.com/three-globe@2.33.0/example/img/earth-topology.png | 2.33.0 |

## Why local?

- Eliminates CDN dependency for air-gapped or restricted-network deployments
- Pins exact versions — no surprise upstream changes
- Three.js is bundled inside `globe.gl.min.js` and exposed as `window.THREE`;
  no separate `three.min.js` tag is needed
