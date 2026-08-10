# Provenance — ThreadForm Essential Tee

- **Source:** Original. Generated procedurally by
  `scripts/generate-essential-tee.mjs`, part of this repository.
- **Created by:** ThreadForm (this codebase), Milestone 02.
- **License:** Original asset. All rights reserved to ThreadForm; not derived
  from or extracted from any third-party product, asset pack, or website.
- **Method:** The mesh is built entirely from explicit vertex coordinates in
  the generator script — a torso panel (`THREE.ExtrudeGeometry` from a
  hand-authored 2D T-shirt silhouette, front/back volume via extrusion
  depth) plus two sleeve tubes (`THREE.CylinderGeometry`, positioned and
  rotated at the shoulder). No scan, photogrammetry, downloaded model, or
  competitor asset was used at any point.
- **Readiness:** `development`. This is a placeholder-quality garment
  sufficient to prove the real-time rendering, manifest, and Project
  pipeline end-to-end — not ThreadForm's final production garment art. It
  will be replaced by a higher-fidelity, properly authored garment in a
  later milestone.
- **Known limitations (visual QA, M02):**
  - The front and back print zones currently resolve to the same mesh
    (`Mesh_Torso`) — there is no per-face front/back split yet. A future
    artwork milestone will need either a UV-region split or a mesh split to
    project front vs. back artwork independently.
  - A small gap is visible where a sleeve meets the torso at certain camera
    angles (e.g. the default 3/4-front view): each sleeve is an open-ended
    `THREE.CylinderGeometry` (no end caps) that is positioned near the
    torso's shoulder edge rather than boolean-merged into it, so the open
    tube end is occasionally visible through the seam. Cosmetic only —
    doesn't affect loading, framing, color, or camera behavior. Fixing it
    properly needs either capped/merged geometry at the shoulder or a hand-
    authored mesh, which is out of scope for a fast procedural
    development-grade asset.
- **Regenerating:** `pnpm generate:essential-tee` from the repo root
  rebuilds `model.glb` here and copies it to
  `apps/web/public/garments/threadform-essential-tee/model.glb` (the copy
  Next.js actually serves — see `docs/ARCHITECTURE.md`).
