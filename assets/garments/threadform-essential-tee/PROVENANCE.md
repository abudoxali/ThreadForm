# Provenance — ThreadForm Essential Tee

- **Source:** Original. Generated procedurally by
  `scripts/generate-essential-tee.mjs`, part of this repository.
- **Created by:** ThreadForm (this codebase). Introduced in Milestone 02;
  geometry rebuilt later in M02, UV layout authored in M03.
- **License:** Original asset. All rights reserved to ThreadForm; not derived
  from or extracted from any third-party product, asset pack, or website.
- **Method:** The mesh is built entirely from explicit coordinates in the
  generator script — a torso revolved from a hand-authored radial profile
  (`THREE.LatheGeometry`, then flattened front-to-back so it reads as an oval
  rather than a cylinder), a disc closing the hem, and two capped sleeve
  tubes (`THREE.CylinderGeometry`) seated into the shoulder ring. No scan,
  photogrammetry, downloaded model, or competitor asset was used at any
  point.
- **Readiness:** `development`. This is a placeholder-quality garment
  sufficient to prove the real-time rendering, manifest, artwork and Project
  pipeline end-to-end — not ThreadForm's final production garment art. It
  will be replaced by a higher-fidelity, properly authored garment in a
  later milestone.
- **Print-zone UV layout (M03):** the torso's UVs are authored deliberately
  so front and back artwork are independent, without splitting the mesh. The
  lathe revolution starts at `-π/2`, which puts the UV seam on the garment's
  left side (away from every print zone), the front centreline at `u = 0.25`
  and the back centreline at `u = 0.75`; the vertical coordinate is
  re-derived from each vertex's own Y so `v` is linear in height rather than
  in profile-point index. `manifest.json` then declares the two zones as
  disjoint rectangles in that space, sized to a ~32 cm printable panel.
  `scripts/verify-essential-tee.mjs` asserts the built GLB actually matches
  those declarations.
- **Resolved since M02:**
  - _Front and back sharing `Mesh_Torso`_ was documented as a limitation
    blocking independent front/back artwork. It turned out not to need a mesh
    split at all — the UV layout above resolves it, and back-face culling
    handles the rest (the far side's triangles are simply not drawn). One
    mesh, two zones.
  - _The shoulder/sleeve seam gap_ (an open-ended cylinder visible through
    the seam) is gone: the sleeves are now capped and seated inside the
    shoulder ring's radius rather than merely touching the surface.
- **Known limitations:** the silhouette is rotationally symmetric by
  construction, so it has no real drape, no side seams, and a simplified
  crew neck. Honest for a `development`-readiness asset; it is what a
  properly authored garment will replace.
- **Regenerating:** `pnpm generate:essential-tee` from the repo root
  rebuilds `model.glb` here and copies it — along with `manifest.json` — to
  `apps/web/public/garments/threadform-essential-tee/` (the copy Next.js
  actually serves — see `docs/ARCHITECTURE.md`). Verify with
  `node scripts/verify-essential-tee.mjs`, which checks mesh/triangle counts,
  bounds, normals, UVs, and the print-zone UV anchors against the manifest.
