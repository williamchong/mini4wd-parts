import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finishFor } from './finish.ts'

test('the material is the product only where the name says so', () => {
  assert.equal(finishFor('HG ALUMINUM WHEELS for LOW PROFILE TIRES II (REVERSIBLE, 2PCS.)'), 'aluminium')
  assert.equal(finishFor('RED SPIKE TIRE & SILVER COLOR PLATED WHEEL SET'), 'plated')
  assert.equal(finishFor('LARGE DIA. CARBON WHEEL SET (w/SOFT SLICK TIRES)', '大径カーボンホイールセット（ソフトスリックタイヤ付）'), 'carbon')
  assert.equal(finishFor('HG CARBON WIDE FRONT PLATE (1.5mm)'), 'carbon')
  assert.equal(finishFor('LOW-PROFILE TIRE & WHEEL SET (5-SPOKE)'), undefined)
})

test('a plated kit is plated by its Japanese name, where the English says metallic', () => {
  assert.equal(finishFor('DCR-01 BLUE METALLIC BODY (MA CHASSIS)', 'DCR-01 (デクロス-01) ブルーメッキボディ (MAシャーシ)'), 'plated')
  assert.equal(finishFor(undefined, '1/32 ヒートエッジ マットライトブルーメッキ (MAシャーシ)'), 'matte-plated')
  assert.equal(finishFor('FULLY COWLED 30TH ANNIV. SUPER HARD LOW PROFILE TIRES & MATTE GREEN PLATED WHEELS'), 'matte-plated')
  // Metallic paint alone is not plating.
  assert.equal(finishFor('TRI GALE SILVER METALLIC BODY (MA CHASSIS)'), undefined)
})

test('polycarbonate is not carbon, and carbon reinforced is a moulding', () => {
  assert.equal(finishFor('ASTUTE CLEAR BODY SET (POLYCARBONATE)', 'アスチュート クリヤーボディセット (ポリカーボネート)'), undefined)
  assert.equal(finishFor('CARBON REINFORCED REAR DOUBLE ROLLER STAY (3 ATTACHMENT POINTS)', 'カーボン強化リヤダブルローラーステー(3点固定タイプ)'), undefined)
  assert.equal(finishFor('CARBON REINFORCED 8T PINION GEAR (6PCS.)', 'カーボン強化8Tピニオンギヤ(6個)'), undefined)
})

test('a word describes the thing it is next to, not the rest of a set', () => {
  assert.equal(finishFor('CARBON WHEEL SET w/REINFORCED GEAR CASE'), 'carbon')
  assert.equal(finishFor('MATTE FINISH BLACK POLYCARBONATE BODY & SILVER PLATED WHEEL SET'), 'plated')
})
