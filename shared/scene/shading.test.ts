import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MeshStandardMaterial, ShaderLib, UniformsUtils } from 'three'
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three'
import { dress } from './shading.ts'

/** Run a dressed material's hook over three's own standard shader, as the renderer would. */
function compiled(material: MeshStandardMaterial) {
  const shader = {
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
    uniforms: UniformsUtils.clone(ShaderLib.physical.uniforms)
  } as unknown as WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, undefined as unknown as WebGLRenderer)
  return shader
}

test('the hook finds every chunk it hangs on, so a three upgrade that renames one fails here', () => {
  const material = new MeshStandardMaterial()
  const { rim } = dress(material, { weave: true })
  const shader = compiled(material)
  assert.match(shader.vertexShader, /vObject = position;/)
  for (const added of ['uniform float rimStrength;', 'weaveWarp', 'roughnessFactor = mix(', 'totalEmissiveRadiance += rimColour']) {
    assert.ok(shader.fragmentShader.includes(added), added)
  }
  // The rim is the material's own uniform object, so setting it needs no recompile.
  assert.equal(shader.uniforms.rimStrength, rim)
  assert.ok(material.defines?.WEAVE_MM)
})

test('every dressed material shares one program unless it is woven', () => {
  const plain = new MeshStandardMaterial()
  const other = new MeshStandardMaterial()
  const woven = new MeshStandardMaterial()
  dress(plain); dress(other); dress(woven, { weave: true })
  assert.equal(plain.customProgramCacheKey(), other.customProgramCacheKey())
  assert.equal(plain.defines?.WEAVE_MM, undefined)
  assert.notEqual(woven.defines?.WEAVE_MM, undefined)
})
