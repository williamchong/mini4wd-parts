import assert from 'node:assert/strict'
import test from 'node:test'
import { labelFor, normaliseLabel, neutralLabel } from './labels.ts'

/**
 * The wiki's wheel and tire fields are hand-edited free text, so this chain is
 * the only thing standing between one wheel and two vocabulary rows. Every
 * spelling asserted here was taken from data/raw/fandom-kits.json rather than
 * invented — a case these tests do not cover is a case the wiki has not
 * produced yet.
 */

test('one spelling survives the wiki writing a type name several ways', () => {
  const canonical = 'Small Fully Cowled-Type'
  for (const spelling of [
    'Small Fully Cowled Type',
    'Small Fully Cowled-Type',
    'Small Fully-Cowled Type',
    'Small Fully Cowled-type'
  ]) {
    assert.equal(normaliseLabel(spelling), canonical, spelling)
  }
})

test('casing is normalised before the rules that depend on it', () => {
  // The wiki capitalises `Low` today. These rules used to be case-sensitive, so
  // a single lower-case spelling would have produced a second vocabulary key
  // that renders untranslated.
  assert.equal(normaliseLabel('Large Low profile 6-spoke'), 'Large Low-Profile 6-Spoke')
  assert.equal(normaliseLabel('large low profile 6 spoke'), 'Large Low-Profile 6-Spoke')
})

test('a "(Both)" marker is dropped and a "(1st)" one is kept', () => {
  // "Both" says the two axles match, which the two slot entries already say.
  assert.equal(normaliseLabel('Large (Both) Narrow Lightweight (Both)'), 'Large Narrow Lightweight')
  assert.equal(normaliseLabel('Small Low-Profile Saber-Type (Both set)'), 'Small Low-Profile Saber-Type')
  // "1st" and "2nd" are the only thing telling the two wheels apart.
  assert.match(normaliseLabel('Small (Both) / Low-Profile Fin-Type (1st) / Low-Profile Dish-Type (2nd)'), /\(1st\)/)
})

test('the motor suffix the wiki uses on some rows and not others is dropped', () => {
  assert.equal(normaliseLabel('Torque-Tuned 2 Motor'), 'Torque-Tuned 2')
  assert.equal(normaliseLabel('Torque-Tuned 2'), 'Torque-Tuned 2')
  // A bare "Motor" carries nothing, and the generator's filter lets it through.
  assert.equal(labelFor('Motor'), undefined)
})

test('an alias reaches the same vocabulary row as the spelling it corrects', () => {
  // The wiki truncates this one article, and inverts the word order in another.
  const canonical = labelFor('Small Low-Profile Saber-Type')
  assert.deepEqual(labelFor('Small Low-Profile Saber-Typ'), canonical)
  assert.deepEqual(labelFor('Small Saber-Type Low-Profile'), canonical)
  assert.equal(canonical?.['zh-HK'], '小徑低框軍刀型輪框')
})

test('a phrase with no vocabulary row keeps its English rather than vanishing', () => {
  const label = labelFor('Small Invented Wheel-Type')
  assert.equal(label?.en, 'Small Invented Wheel-Type')
  assert.equal(label?.['zh-HK'], undefined)
})

test('a key off the prototype chain is not mistaken for a translation', () => {
  // `toString` keeps its capital through normalisation, so unlike `constructor`
  // it reaches the vocabulary lookup exactly as the prototype spells it.
  assert.deepEqual(labelFor('toString'), { en: 'toString' })
})

test('nothing in, nothing out', () => {
  assert.equal(labelFor(undefined), undefined)
  assert.equal(labelFor(''), undefined)
  assert.equal(labelFor('   '), undefined)
})

test('a locale-neutral value reads the same in every locale we serve', () => {
  assert.deepEqual(neutralLabel('3.5:1'),
    { ja: '3.5:1', en: '3.5:1', 'zh-HK': '3.5:1', 'zh-TW': '3.5:1' })
})
