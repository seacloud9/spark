# Spark · BabylonJS host example

A working example of Spark Gaussian splats rendered inside a BabylonJS scene
via the texture-bridge MVP in `babylon.SparkBabylonHost`.

What the page shows:

- A BabylonJS `Engine` and `Scene` set up against `<canvas id="renderCanvas">`.
- A rainbow `SplatMesh` sphere on the left, the RGB axes `SplatMesh` on the
  right (shifted forward so the two overlap along the camera ray) — both
  live in the host's internal Three scene.
- A `babylon.SparkBabylonHost` that drives Spark each Babylon frame,
  reads its rendered pixels back, and pushes them to a Babylon
  `RawTexture`. The texture is composited as a fullscreen background
  `Layer`, so the visible Babylon canvas ends up showing Spark splats.
- Both meshes slowly rotate so the cross-mesh painter sort is visible.

## Running

```bash
pnpm install
pnpm run build         # builds dist/spark.module.js with the public
                       # babylon namespace export
pnpm run dev           # serves examples/ on vite
```

then open <http://localhost:5173/examples/spark-babylon/>.

If you only built dev mode you can also serve any static file server
that serves `dist/` and `examples/` from the same root.

## What this example does NOT do

- It does not let Babylon meshes occlude or depth-sort against Spark
  splats. The splats are composited as a background Layer, not as
  scene geometry. Add a Babylon mesh and the mesh draws *on top of*
  the splats; the inverse (splats in front of mesh) requires a native
  Babylon Spark material that is not yet implemented.
- It does not support per-splat picking via `scene.pick…` — Babylon's
  picker has no knowledge of the splat layer.
- It does one CPU `readPixels` per Babylon frame. Fine for viewers,
  not optimal for hot real-time loops.

See `src/backends/README.md` for the full story and the planned native
Babylon material that closes these gaps.

## Adapting to your scene

- Replace the two procedural meshes with `new SplatMesh({ url: ... })`
  pointing at a `.spz` / `.splat` / `.ksplat` / `.ply` file. Spark's
  loader does the rest; the host doesn't care what the splats look
  like.
- Add Babylon meshes to `scene` as normal. They render alongside the
  splat layer (with the occlusion caveat above).
- Call `host.setCamera(...)` whenever your viewpoint changes; the
  splat sort updates each frame from inside `host.renderOnce()`.
