/**
 * Colour words -> the one hex a proxy is drawn in.
 *
 * Two kinds of text reach this: the wiki's `Body color`, `Wheel color` and
 * `Tire color` fields on a kit's Technical Info List ("Clear Blue", "Matte
 * Silver Plated", "Metallic Blue<br>Silver Plated"), and Tamiya's own product
 * names, which say a part's colour when it comes in more than one
 * ("2mmアルミロックナット （レッド5個）", "RUBBER BODY CATCHES (BLUE/RED)").
 *
 * The palette is stylised, not measured: one flat colour per word, lightened
 * for clear plastic and darkened for smoke, because the pane draws a proxy and
 * a reader recognises "the blue one", not a Pantone. Finishes that change how a
 * colour shines rather than which colour it is — plated, metallic, pearl,
 * matte, gloss — are dropped; the proxy's material already decides the shine.
 */

import { normalise } from './taxonomy.ts'

export type Hex = `#${string}`

/**
 * Longest phrase first, so `light blue` is read before `blue` and `yellow
 * green` before either half. Keys are lower-case with single spaces; Japanese
 * keys are matched as written.
 */
const WORDS: [string, Hex][] = ([
  ['yellow green', '#9bcf3f'],
  ['yellow-green', '#9bcf3f'],
  ['watermelon green', '#4fae5a'],
  ['leaf green', '#5daa3a'],
  ['light green', '#8fd67a'],
  ['light blue', '#7cc0ec'],
  ['pastel blue', '#9cc8ee'],
  ['sky blue', '#7cc0ec'],
  ['pale cyan', '#9fe0e8'],
  ['dark blue', '#233f8f'],
  ['deep blue', '#233f8f'],
  ['royal blue', '#2b4fb8'],
  ['prism blue', '#3f7fd6'],
  ['light gray', '#b9bec4'],
  ['light grey', '#b9bec4'],
  ['super light gray', '#d3d6da'],
  ['light gun metal', '#7d838b'],
  ['gun metal', '#565b62'],
  ['dark silver', '#8e949c'],
  ['dull silver', '#a9aeb5'],
  ['light pink', '#f4a9c8'],
  ['rose pink', '#e9658f'],
  ['red magenta', '#c8307a'],
  ['light purple', '#b595dc'],
  ['deep gold', '#b8892a'],
  ['dark gold', '#b8892a'],
  ['racing white', '#eceae4'],
  ['pure white', '#f6f7f8'],
  ['ultramarine', '#2440a8'],
  ['white', '#eef0f2'],
  ['black', '#1f2124'],
  ['red', '#d0312d'],
  ['blue', '#2f5fc4'],
  ['yellow', '#f2c230'],
  ['green', '#2f9e4f'],
  ['orange', '#ec7a24'],
  ['purple', '#7a4bb5'],
  ['violet', '#8a5cc9'],
  ['pink', '#ec6fa8'],
  ['silver', '#c9ced6'],
  ['gold', '#d4a93a'],
  ['copper', '#b8703f'],
  ['gray', '#8e949b'],
  ['grey', '#8e949b'],
  ['cyan', '#35bfd4'],
  ['maroon', '#7b2230'],
  ['brown', '#7a5232'],
  ['buff', '#d9c49a'],
  ['carbon', '#2a2c30'],
  ['magenta', '#c8307a'],
  // Tamiya's katakana and kanji, as the product names write them.
  ['イエローグリーン', '#9bcf3f'],
  ['黄緑', '#9bcf3f'],
  ['ダークブルー', '#233f8f'],
  ['ライトブルー', '#7cc0ec'],
  ['ガンメタル', '#565b62'],
  ['ホワイト', '#eef0f2'],
  ['白', '#eef0f2'],
  ['ブラック', '#1f2124'],
  ['黒', '#1f2124'],
  ['レッド', '#d0312d'],
  ['赤', '#d0312d'],
  ['ブルー', '#2f5fc4'],
  ['青', '#2f5fc4'],
  ['イエロー', '#f2c230'],
  ['黄', '#f2c230'],
  ['グリーン', '#2f9e4f'],
  ['緑', '#2f9e4f'],
  ['オレンジ', '#ec7a24'],
  ['パープル', '#7a4bb5'],
  ['紫', '#7a4bb5'],
  ['バイオレット', '#8a5cc9'],
  ['ピンク', '#ec6fa8'],
  ['シルバー', '#c9ced6'],
  ['ゴールド', '#d4a93a'],
  ['金メッキ', '#d4a93a'],
  ['グレイ', '#8e949b'],
  ['グレー', '#8e949b'],
  ['マルーン', '#7b2230']
] as [string, Hex][]).sort((a, b) => b[0].length - a[0].length)

/** Brighter, more saturated takes on the base words, for "Fluorescent X" / "蛍光X". */
const FLUORESCENT: Record<string, Hex> = {
  yellow: '#e6f53a',
  green: '#5fe84a',
  orange: '#ff7a2a',
  pink: '#ff5fae',
  red: '#ff3b3b',
  イエロー: '#e6f53a',
  グリーン: '#5fe84a',
  オレンジ: '#ff7a2a',
  ピンク: '#ff5fae',
  レッド: '#ff3b3b'
}

const CLEAR: Hex = '#dfe6ea'
const SMOKE: Hex = '#4a4d52'

function mix(hex: Hex, toward: Hex, amount: number): Hex {
  const channel = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const out = [0, 1, 2].map(i => Math.round(channel(hex, i) + (channel(toward, i) - channel(hex, i)) * amount))
  return `#${out.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Case- and spacing-insensitive, with wiki markup reduced to a separator. NFKC
 * folds Tamiya's full-width brackets and digits, as it does for categories.
 */
const tidy = (text: string) => normalise(text)
  .replace(/<br\s*\/?>/gi, ' / ')
  // Katakana has no word boundaries, and トレッド ("tread") ends in レッド ("red").
  .replace(/トレッド/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

/** Whether `word` starts at `at` on a word boundary — Latin words only; kana and kanji have none. */
function boundedAt(text: string, word: string, at: number): boolean {
  if (!/^[a-z]/.test(word)) return true
  const before = text[at - 1]
  const after = text[at + word.length]
  return !(before && /[a-z]/.test(before)) && !(after && /[a-z]/.test(after))
}

/** Every colour word in the text, in reading order, with where it starts and ends. */
function scan(text: string): { word: string; hex: Hex; start: number; end: number }[] {
  const found: { word: string; hex: Hex; start: number; end: number }[] = []
  const taken = new Array<boolean>(text.length).fill(false)
  for (const [word, hex] of WORDS) {
    let from = 0
    for (let at = text.indexOf(word, from); at !== -1; at = text.indexOf(word, from)) {
      from = at + word.length
      if (!boundedAt(text, word, at)) continue
      if (taken.slice(at, at + word.length).some(Boolean)) continue
      taken.fill(true, at, at + word.length)
      found.push({ word, hex, start: at, end: at + word.length })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

/**
 * The first colour a phrase names, or undefined when it names none.
 *
 * "First" is the rule because every multi-colour value the wiki and Tamiya
 * write leads with the dominant one: "Blue and Clear", "Red, Smoke", "Metallic
 * Blue<br>Silver Plated", "(BLACK & PINK)". A phrase that is only a modifier
 * still means something — "Clear" is clear plastic, "Smoke" is smoked.
 */
export function colourOf(phrase: string | undefined): Hex | undefined {
  if (!phrase) return undefined
  const text = tidy(phrase)
  // Carbon is a material that happens to have a colour, so a name that also
  // says one ("HG CARBON FRONT STAY (1.5mm/SILVER)") means that one.
  const found = scan(text)
  const first = found.find(match => match.word !== 'carbon') ?? found[0]
  if (!first) {
    if (/\bblack smoke\b/.test(text)) return '#2a2c30'
    if (/\blight smoke\b/.test(text)) return '#8d9197'
    if (/\bsmoke\b|スモーク/.test(text)) return SMOKE
    if (/\bclear\b|\btranslucent\b|クリヤー|クリアー|透明/.test(text)) return CLEAR
    return undefined
  }
  const lead = text.slice(Math.max(0, first.start - 14), first.start)
  if (/fluorescent\s*$|蛍光\s*$/.test(lead) && FLUORESCENT[first.word]) return FLUORESCENT[first.word]
  if (/\bblack smoke\b/.test(text) && first.word === 'black') return '#2a2c30'
  if (/(clear|translucent|クリヤー|クリアー)\s*$/.test(lead)) return mix(first.hex, '#ffffff', 0.35)
  return first.hex
}

/** All colours a phrase names, in order — for names that list one per component. */
export function coloursIn(phrase: string | undefined): Hex[] {
  return phrase ? scan(tidy(phrase)).map(found => found.hex) : []
}
