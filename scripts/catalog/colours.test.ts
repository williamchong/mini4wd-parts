import assert from 'node:assert/strict'
import test from 'node:test'
import { colourOf, coloursIn } from './colours.ts'

/**
 * Every phrase here is one the wiki's Technical Info List or a Tamiya product
 * name actually wrote (data/raw/fandom-kits.json, content/parts), and each
 * test is a way the first version of the parser read one wrong.
 */

test('a plain colour word is that colour, in either script', () => {
  assert.equal(colourOf('Blue'), '#2f5fc4')
  assert.equal(colourOf('2mmアルミロックナット （レッド5個）'), '#d0312d')
  assert.equal(colourOf('AO-1014 8Tピニオン（紫）'), '#7a4bb5')
})

test('the longest phrase wins over the word inside it', () => {
  assert.equal(colourOf('Light Blue'), '#7cc0ec')
  assert.equal(colourOf('Gun Metal'), '#565b62')
  assert.equal(colourOf('AO-1032 ミニ四駆 G-6黄緑、G-10青 ギヤ'), '#9bcf3f')
})

test('the first colour named is the one taken', () => {
  assert.equal(colourOf('Metallic Blue<br>Silver Plated'), '#2f5fc4')
  assert.equal(colourOf('RUBBER BODY CATCHES (BLUE/RED)'), '#2f5fc4')
  assert.equal(colourOf('Gold Plated (1st)<br>Carbon (2nd)'), '#d4a93a')
})

test('carbon is a material, so a named colour beside it wins', () => {
  assert.equal(colourOf('FULLY COWLED 30TH ANNIV. HG CARBON FRONT STAY (1.5mm/SILVER)'), '#c9ced6')
  assert.equal(colourOf('Carbon'), '#2a2c30')
})

test('clear, smoke and fluorescent change the colour rather than hiding it', () => {
  assert.equal(colourOf('Clear'), '#dfe6ea')
  assert.equal(colourOf('Smoke'), '#4a4d52')
  assert.equal(colourOf('Black Smoke'), '#2a2c30')
  assert.equal(colourOf('Fluorescent Green'), '#5fe84a')
  // Clear Blue is lighter than Blue, not Blue and not Clear.
  const clearBlue = colourOf('Clear Blue')!
  assert.notEqual(clearBlue, colourOf('Blue'))
  assert.notEqual(clearBlue, colourOf('Clear'))
})

test('a colour word inside another word is not a colour', () => {
  // トレッド ("tread") ends in レッド ("red"); OFFSET TREAD TIRES are black.
  assert.equal(colourOf('オフセットトレッドタイヤ'), undefined)
  assert.equal(colourOf('REINFORCED GEAR COVER'), undefined)
})

test('every colour a name lists, in order, for sets with one per component', () => {
  assert.deepEqual(coloursIn('RED SPIKE TIRE & SILVER COLOR PLATED WHEEL SET'), ['#d0312d', '#c9ced6'])
  assert.deepEqual(coloursIn('LOW-PROFILE TIRE & WHEEL SET'), [])
})
