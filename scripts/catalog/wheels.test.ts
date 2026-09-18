import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TIRES, WHEELS, shapeId } from '../../shared/scene/wheels.ts'
import { finishFor, printedTireMm, shapesFor } from './wheels.ts'

test('a product name resolves to the wheel and tire its words describe', () => {
  const cases: [string, string | undefined, string | undefined][] = [
    // The face in brackets and the size in words, which is the common shape.
    ['LARGE DIA. LOW FRICTION LOW-PROFILE TIRES (31mm) & CARBON WHEELS (DISH)',
      'large-low-profile-dish-type', 'large-low-profile'],
    ['SUPER HARD SMALL DIA. LOW-PROFILE TIRES (26mm) & CARBON WHEELS (Y SPOKE)',
      'small-low-profile-y-spoke', 'small-low-profile'],
    // No size word at all: Tamiya only marks the large ones, so this is small.
    ['LOW-PROFILE TIRE & WHEEL SET (5-SPOKE)', 'small-low-profile-5-spoke', 'small-low-profile'],
    ['OFFSET TREAD TIRES', 'small', 'small-offset'],
    // Width outranks a slick, which says nothing about the shape.
    ['SMALL DIA. LOW FRICTION NARROW TIRES (24mm) & CARBON WHEELS (3-SPOKE)',
      'small-narrow-3-spoke', 'small-narrow'],
    ['NARROW LARGE DIA. WHEEL & WHITE ARCHED TIRES (FOR SUPER X & XX CHASSIS)',
      'large-narrow', 'large-narrow-arched'],
    ['RESTON SPONGE TIRES (BLUE)', 'small', 'small-sponge'],
    ['SPIKE TIRE & WHEEL SET (for EZ CHASSIS)', 'small', 'small-spike'],
    // "LOW-HEIGHT" is the same fitment under another of Tamiya's names.
    ['LOW-HEIGHT TIRE & WHEEL SET (FIN)', 'small-low-profile-fin-type', 'small-low-profile']
  ]
  for (const [name, wheel, tire] of cases) {
    assert.deepEqual(shapesFor(name), { wheel, tire }, name)
  }
})

test('every shape a name resolves to is one the tables define', () => {
  for (const [name] of [['LARGE DIA. TIRE & WHEEL SET for EZ CHASSIS (WIDE TREAD)'],
    ['WHEEL w/ALUMINUM DISC SET (7-SPOKE MARKINGS)'],
    ['MINI 4WD 40th ANNIVERSARY SUPER HARD LOW-PROFILE TIRE & WHEEL SET (12-SPOKE)']]) {
    const { wheel, tire } = shapesFor(name!)
    assert.ok(!wheel || Object.hasOwn(WHEELS, wheel), `${name}: wheel ${wheel}`)
    assert.ok(!tire || Object.hasOwn(TIRES, tire), `${name}: tire ${tire}`)
  }
})

test('the material is the product only where the name says so', () => {
  assert.equal(finishFor('LARGE DIA. CARBON WHEEL SET (w/SOFT SLICK TIRES)'), 'metal')
  assert.equal(finishFor('HG ALUMINUM WHEELS for LOW PROFILE TIRES II (REVERSIBLE, 2PCS.)'), 'metal')
  assert.equal(finishFor('RED SPIKE TIRE & SILVER COLOR PLATED WHEEL SET'), 'metal')
  assert.equal(finishFor('LOW-PROFILE TIRE & WHEEL SET (5-SPOKE)'), undefined)
})

test('the millimetres in a name are the tire\'s, and only where they are bracketed', () => {
  assert.equal(printedTireMm('SMALL DIA. LOW FRICTION LOW-PROFILE TIRES (26mm) & CARBON WHEELS (FIN)'), 26)
  assert.equal(printedTireMm('LARGE DIA. LOW FRICTION ARCHED TIRES (31mm) & CARBON WHEELS (V SPOKE)'), 31)
  assert.equal(printedTireMm('LOW-PROFILE TIRE & WHEEL SET (Y SPOKE)'), undefined)
})

test('a wiki phrase slugs to the key its shape is filed under', () => {
  assert.equal(shapeId('Large Low-Profile 6-Spoke'), 'large-low-profile-6-spoke')
  assert.equal(shapeId('Large MS II'), 'large-ms-ii')
  assert.equal(shapeId('Small X Narrow-Type'), 'small-x-narrow-type')
  for (const phrase of ['Small Low-Profile Saber-Type', 'Large Narrow Lightweight', 'Small VS-Type']) {
    assert.ok(Object.hasOwn(WHEELS, shapeId(phrase)), phrase)
  }
  for (const phrase of ['Small Low-Profile Slick', 'Large Avante-Type Slick', 'Large Arched']) {
    assert.ok(Object.hasOwn(TIRES, shapeId(phrase)), phrase)
  }
})
