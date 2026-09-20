import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { readJsonFile, readYamlDir } from './io.ts'
import { ogCardDir, ogCardFile, thumbnailFile } from './thumbnails.ts'
import { OG_CARD_SIZE } from '../../shared/catalog/og.ts'
import { THUMB_SIZES } from '../../shared/catalog/thumbnails.ts'
import { NAME_LOCALES, resolveName, type NameLocale } from '../../shared/catalog/names.ts'
import type { Chassis } from '../../shared/catalog/schema.ts'

/**
 * Stage 1c of the catalog pipeline: the 1200x630 share cards a chassis page
 * hands to Facebook, X and LINE.
 *
 * Why a generated card rather than the detail thumbnail the page used before:
 * 320x240 is under the 600px every large-card format wants, so the page had to
 * ask for the small `summary` card and got a postage stamp beside its title.
 * Blowing the photo up to 1200x630 is the one thing we will not do — the whole
 * defence of `public/thumbs/` is that the copies are small (docs/PLAN.md §7) —
 * so the card is our own layout, in our own words, with the 320x240 photo
 * placed in it unscaled.
 *
 * No network: it reads the photo `catalog:thumbs` already fetched. Run it after
 * `catalog:thumbs`, and re-run it when a chassis record or the wording changes.
 *
 * Text is drawn by librsvg through sharp, against the fonts on this machine,
 * and the output is committed — so CI renders nothing and needs no CJK font.
 */

const { width: W, height: H } = OG_CARD_SIZE

/** The nav's colour, so a card in a timeline is recognisably this site. */
const INK = '#333333'
const PAPER = '#ffffff'
const BRIGHT = '#ffffff'
const MUTED = '#b4b4b4'
const FAINT = '#6f6f6f'

const PAD = 72
/** The photo panel is the thumbnail plus a margin, and nothing more: sizing it
 *  to the picture is what stops the picture being sized to it. Taken from
 *  `THUMB_SIZES` rather than restated, so the panel follows the file it holds. */
const PHOTO = THUMB_SIZES.detail
const PANEL = { width: PHOTO.width + 80, height: PHOTO.height + 80 }
const PANEL_X = W - PAD - PANEL.width
const PANEL_Y = Math.round((H - PANEL.height) / 2)

/** The type column stops where the panel starts. */
const TEXT_MAX = PANEL_X - PAD - 48

const FONTS = `'Helvetica Neue', 'PingFang HK', 'Hiragino Sans', Arial, sans-serif`

type Messages = { [key: string]: string | Messages }
const messages: Record<NameLocale, Messages> = {
  'zh-Hant': readJsonFile<Messages>('i18n/locales/zh-Hant.json'),
  en: readJsonFile<Messages>('i18n/locales/en.json')
}

/** `a.b.c` out of the locale file, so the card says exactly what the page says. */
function t(locale: NameLocale, path: string): string {
  const value = path.split('.').reduce<string | Messages | undefined>(
    (node, key) => (typeof node === 'object' ? node[key] : undefined), messages[locale])
  if (typeof value !== 'string') throw new Error(`${locale}: no message at ${path}`)
  return value
}

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)

/**
 * Roughly how wide a string will draw. librsvg has no measurement API we can
 * reach from here, and the only decision resting on this is whether a title
 * drops a step in size, so a CJK-vs-Latin advance width is accurate enough:
 * a full-width glyph is one em, a Latin one about half.
 */
const FULL_WIDTH = /[⺀-鿿＀-｠￠-￦]/
function textWidth(text: string, size: number): number {
  let width = 0
  for (const ch of text) width += FULL_WIDTH.test(ch) ? size : size * 0.55
  return width
}

/** The largest size at which the line still fits the column. */
function fitted(text: string, max: number, from: number, to: number): number {
  let size = from
  while (size > to && textWidth(text, size) > max) size -= 2
  return size
}

function text(
  content: string,
  { x, y, size, fill, weight = 400, spacing = 0 }:
  { x: number, y: number, size: number, fill: string, weight?: number, spacing?: number }
) {
  return `<text x="${x}" y="${y}" font-family="${FONTS}" font-size="${size}"`
    + ` font-weight="${weight}" fill="${fill}"`
    + (spacing ? ` letter-spacing="${spacing}"` : '')
    + `>${escapeXml(content)}</text>`
}

/** The dot-separated spec lines, skipping anything a record leaves out. */
const dotted = (parts: (string | undefined)[]) => parts.filter(Boolean).join('  ·  ')

function card(chassis: Chassis, locale: NameLocale): string {
  const name = resolveName(chassis.names, locale).value
  const family = t(locale, `chassis.family.${chassis.family}`)
  const headline = dotted([
    t(locale, `build.motorPosition.${chassis.motorPosition}`),
    t(locale, `spec.shaft.${chassis.motorShaft}`),
    String(chassis.releaseYear)
  ])
  const numbers = dotted([
    chassis.kitGearRatio ? `${t(locale, 'spec.gearRatio')} ${chassis.kitGearRatio}` : undefined,
    chassis.wheelbaseMm ? `${t(locale, 'spec.wheelbase')} ${chassis.wheelbaseMm}mm` : undefined,
    chassis.weightG ? `${t(locale, 'spec.weight')} ${chassis.weightG}g` : undefined
  ])

  const titleSize = fitted(name, TEXT_MAX, 88, 48)
  const headlineSize = fitted(headline, TEXT_MAX, 34, 24)
  const numbersSize = fitted(numbers, TEXT_MAX, 28, 20)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL.width}" height="${PANEL.height}" rx="20" fill="${PAPER}"/>
  ${text(family, { x: PAD, y: 212, size: 26, fill: MUTED, spacing: 1 })}
  ${text(name, { x: PAD, y: 212 + 26 + titleSize, size: titleSize, fill: BRIGHT, weight: 700 })}
  ${text(headline, { x: PAD, y: 212 + 26 + titleSize + 64, size: headlineSize, fill: BRIGHT })}
  ${text(numbers, { x: PAD, y: 212 + 26 + titleSize + 64 + 46, size: numbersSize, fill: MUTED })}
  <rect x="${PAD}" y="${H - 132}" width="${TEXT_MAX}" height="1" fill="${FAINT}"/>
  ${text('mini4wd.parts', { x: PAD, y: H - 84, size: 30, fill: BRIGHT, weight: 700 })}
  ${text(t(locale, 'site.title'), { x: PAD, y: H - 46, size: 24, fill: MUTED })}
</svg>`
}

const chassis = readYamlDir<Chassis>('content/chassis').map(entry => entry.data)

console.log(`Share cards -> public/og (${W}x${H} jpeg)`)

for (const locale of NAME_LOCALES) {
  await mkdir(ogCardDir('chassis', locale), { recursive: true })
}

let written = 0
let bytes = 0
for (const entry of chassis) {
  // Decoded once and composited into every locale's card: the photo is the same
  // file, and only the words around it differ.
  const photo = await sharp(thumbnailFile('chassis', entry.id, 'detail')).png().toBuffer()
  for (const locale of NAME_LOCALES) {
    const jpeg = await sharp(Buffer.from(card(entry, locale)))
      .composite([{
        input: photo,
        left: PANEL_X + Math.round((PANEL.width - PHOTO.width) / 2),
        top: PANEL_Y + Math.round((PANEL.height - PHOTO.height) / 2)
      }])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer()
    await writeFile(ogCardFile('chassis', locale, entry.id), jpeg)
    written++
    bytes += jpeg.byteLength
  }
}

console.log(`  ${chassis.length} chassis x ${NAME_LOCALES.length} locales = ${written} cards,`
  + ` ${(bytes / written / 1024).toFixed(1)} KB average, ${(bytes / 1024).toFixed(0)} KB total`)
