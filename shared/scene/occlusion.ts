/**
 * The desktop tier (docs/PLAN.md §5.6, "Materials and light", phase 7):
 * ambient occlusion, which darkens the creases the studio lights evenly —
 * roller posts, wheel arches, the gap under a seated shell. Imported only
 * where the pane is 16:9, so a phone never downloads it.
 *
 * Two things the pane needs that the passes do not do by themselves:
 *
 * - **Transparency survives.** The canvas is transparent over the frame's
 *   background and the floor is a shadow with nothing under it. The render
 *   target keeps alpha, GTAO's blend multiplies alpha by one, and
 *   `OutputPass` copies it through, so the page shows where the car is not.
 * - **An empty slot's outline is not a surface.** GTAO's normal pass draws
 *   every mesh with one override material, and that ignores `wireframe`, so
 *   each outline would be shaded as a solid box and leave a dark blob. The
 *   pane puts outlines on a layer of their own (`OUTLINE_LAYER` in
 *   Scene.client.vue, which cannot import a value from here without pulling
 *   these passes into its chunk), and GTAO looks through a camera that copies
 *   the pane's every frame but sees only the default layer.
 *
 * Tone mapping moves from the materials to `OutputPass`, and the canvas's
 * own antialias no longer reaches the image, so the target multisamples.
 */
import { HalfFloatType, WebGLRenderTarget } from 'three'
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'

export type Occlusion = {
  setSize: (width: number, height: number) => void
  render: () => void
  dispose: () => void
}

export function occlusion(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): Occlusion {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))

  const seen = camera.clone()
  const gtao = new GTAOPass(scene, seen)
  // In the scene's millimetres: a crease is a few mm deep, and a radius much
  // larger than a roller post darkens the floor around the whole car.
  gtao.updateGtaoMaterial({ radius: 6, thickness: 4, distanceFallOff: 1, scale: 1, samples: 24 })
  // Denoised wider than three's default: at its radius the sampling noise
  // stayed as grain across a wheel's spokes and dotted every outline's line.
  gtao.updatePdMaterial({ radius: 10, rings: 4, samples: 24 })
  gtao.blendIntensity = 0.85
  composer.addPass(gtao)
  composer.addPass(new OutputPass())

  return {
    setSize: (width, height) => composer.setSize(width, height),
    render() {
      seen.copy(camera)
      seen.layers.set(0)
      composer.render()
    },
    dispose() {
      gtao.dispose()
      composer.dispose()
      target.dispose()
    }
  }
}
