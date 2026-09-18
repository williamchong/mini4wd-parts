/**
 * Detail from the shader rather than from textures (docs/PLAN.md §5.6,
 * "Materials and light", phase 5). Generated geometry has no UVs, so there is
 * nothing a texture could be mapped by; what a surface needs is worked out
 * from its object-space position instead, in one `onBeforeCompile` hook that
 * every material in the pane shares.
 *
 * Two things live here:
 *
 * - **A rim** for the part under the pointer and the part whose picker is
 *   open. It lights the part's silhouette in one highlight colour, where the
 *   emissive wash it replaces tinted the whole part in its own colour, which
 *   on a black tire or a black plate was no highlight at all.
 * - **A carbon weave** on a carbon plate: 2/2 twill in the plate's own plane,
 *   each tow rounded across its width and alternately glossier, so the
 *   studio's panels break up into the checker real carbon shows.
 *
 * The rim is a uniform, so every material shares one program whatever its
 * highlight; the weave is a define, one more program for the carbon plates.
 * The hook's source is the same function for every material, and three keys
 * a program by that source plus the defines, so none of this compiles twice.
 */
import { Color } from 'three'
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'

/** The highlight, one colour on every part: the pane's own light blue, legible on black, white and red alike. */
const RIM = new Color(0x4fb3ff)

/**
 * The width of one tow of the weave, in mm. Real 3K twill is about 1 mm; at
 * the home view a millimetre is about five pixels, and a pattern much finer
 * than that shimmers as the camera moves.
 */
export const WEAVE_MM = 1.6

/** Handles to what `dress` put on a material, to change without recompiling. */
export type Dressing = { rim: { value: number } }

function hook(this: MeshStandardMaterial, shader: WebGLProgramParametersWithUniforms) {
  const { rim } = this.userData.dressing as Dressing
  shader.uniforms.rimStrength = rim
  shader.uniforms.rimColour = { value: RIM }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObject;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObject = position;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObject;\nuniform float rimStrength;\nuniform vec3 rimColour;')
    // Which tow is on top in this cell, 2/2 twill: two cells of warp, two of
    // weft, stepping one cell per row, so the tows run in diagonal bands.
    .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef WEAVE_MM
  vec2 weaveCell = floor(vObject.xz / WEAVE_MM);
  vec2 weaveAt = fract(vObject.xz / WEAVE_MM);
  float weaveWarp = step(mod(weaveCell.x + weaveCell.y, 4.0), 1.5);
  float weaveAcross = mix(weaveAt.x, weaveAt.y, weaveWarp);
  float weaveTow = sin(weaveAcross * PI);
  diffuseColor.rgb *= mix(0.7, 1.0, weaveWarp) * (0.8 + 0.2 * weaveTow);
#endif`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef WEAVE_MM
  roughnessFactor = mix(0.55, 0.2, weaveWarp * weaveTow);
#endif`)
    // Strongest where the surface turns away from the eye, the part's outline,
    // over a faint wash: a wheel seen face-on has almost no outline, and
    // without the wash only its spokes' edges would say it was lit.
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float rimFacing = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += rimColour * rimStrength * (0.2 + 0.8 * rimFacing * rimFacing);`)
}

/**
 * Give a material the pane's shading: the rim, off until `rim.value` is set,
 * and, for a carbon plate, the weave. Call once, before the material is drawn.
 */
export function dress(material: MeshStandardMaterial, { weave = false } = {}): Dressing {
  const dressing: Dressing = { rim: { value: 0 } }
  material.userData.dressing = dressing
  if (weave) material.defines = { ...material.defines, WEAVE_MM: WEAVE_MM.toFixed(2) }
  material.onBeforeCompile = hook
  return dressing
}
