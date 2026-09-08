import { fetchJson, progress } from '../fetch.ts'

/**
 * Mini 4WD Fandom wiki (CC-BY-SA). We take nothing from it into content/ — it
 * is a second opinion used to audit our own derivation, because our categories
 * come from ordered substring rules over Japanese product names and that design
 * has exactly one failure mode: a short keyword swallowing a longer word.
 *
 * The useful property is the shape of `Infobox Grade-Up Parts`: one article
 * covers a whole product family, so 93 articles carry ~470 item numbers, each
 * with a hand-written `Parts type`.
 */

const API = 'https://mini-4wd.fandom.com/api.php'

/** The template whose `Parts type` field we audit against. */
export const GUP_TEMPLATE = 'Template:Infobox Grade-Up Parts'

/**
 * The per-variant spec table on car articles. Unlike the GUP infobox this is
 * a real import rather than a cross-check: Tamiya publishes no bill of
 * materials for a kit, and this template is the only structured source for
 * what a given box actually contains (docs/PLAN.md §4.7).
 */
export const KIT_TEMPLATE = 'Template:Technical Info List'

/**
 * Match a template call by the same name used for the API query, so the two
 * cannot drift apart. MediaWiki treats spaces and underscores in template names
 * as interchangeable, and articles use both.
 */
export const templatePattern = (name: string) => new RegExp(
  name
    .replace(/^Template:/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[ _]/g, '[ _]'),
  'i'
)

export interface FandomItemRef {
  id: string
  /** The parenthesised variant label that follows the number, if any. */
  variant?: string
}

export interface FandomPart {
  title: string
  partsType?: string
  items: FandomItemRef[]
}

/**
 * Tamiya item numbers are five digits in a known set of prefixes. Anchoring on
 * the prefixes keeps the other five-digit numbers the wiki writes — prices,
 * dimensions — from being read as items.
 */
const ITEM_NUMBER = /\b((?:10|15|17|18|19|49|55|84|92|93|94|95)\d{3})\b/g

/**
 * Split a template body on its top-level `|`. Wiki markup nests `[[File:x|y]]`
 * and `{{Translation|a|b}}` inside parameter values, so a plain `.split('|')`
 * shreds them.
 */
export function splitParams(body: string): string[] {
  const params: string[] = []
  let buffer = ''
  let square = 0
  let curly = 0

  for (let i = 0; i < body.length;) {
    const pair = body.slice(i, i + 2)
    if (pair === '[[' || pair === ']]') {
      square += pair === '[[' ? 1 : -1
      buffer += pair
      i += 2
    }
    else if (pair === '{{' || pair === '}}') {
      curly += pair === '{{' ? 1 : -1
      buffer += pair
      i += 2
    }
    else if (body[i] === '|' && square === 0 && curly === 0) {
      params.push(buffer)
      buffer = ''
      i += 1
    }
    else {
      buffer += body[i]
      i += 1
    }
  }
  params.push(buffer)
  return params
}

/**
 * Pure parser for every `{{Template|k = v|…}}` call of one name, in document
 * order. Keys are lower-cased and lose a trailing dot, because the wiki writes
 * both "No." and "No".
 *
 * Plural because a car article carries one Technical Info List per variant —
 * Avante Jr. has ten, one per re-release — so reading only the first would
 * quietly drop every box but one.
 *
 * An unterminated call ends the scan rather than being guessed at: the closing
 * `}}` is what tells us `i - 2` is the end of the body, and without it the last
 * field silently loses its final two characters.
 */
export function parseTemplates(text: string, name: RegExp): Record<string, string>[] {
  // Global so the scan can resume from `lastIndex` rather than re-slicing the
  // rest of the article on every call it finds.
  const opening = new RegExp(`\\{\\{\\s*${name.source}\\s*`, `${name.flags.replace('g', '')}g`)
  const calls: Record<string, string>[] = []
  let offset = 0

  while (offset < text.length) {
    opening.lastIndex = offset
    const start = opening.exec(text)
    if (!start) break

    let depth = 1
    let i = start.index + start[0].length
    const from = i
    while (i < text.length && depth > 0) {
      const pair = text.slice(i, i + 2)
      if (pair === '{{') { depth += 1; i += 2 }
      else if (pair === '}}') { depth -= 1; i += 2 }
      else i += 1
    }
    if (depth > 0) break

    const fields: Record<string, string> = {}
    for (const param of splitParams(text.slice(from, i - 2))) {
      const split = param.indexOf('=')
      if (split === -1) continue
      const key = param.slice(0, split).trim().replace(/\.$/, '').trim().toLowerCase()
      if (key) fields[key] = param.slice(split + 1).trim()
    }
    calls.push(fields)
    offset = i
  }

  return calls
}

/** The first call, for the infoboxes that only ever appear once per article. */
export const parseTemplate = (text: string, name: RegExp): Record<string, string> | undefined =>
  parseTemplates(text, name)[0]

/** Pure parser for one article's wikitext. */
export function parseGupArticle(title: string, wikitext: string): FandomPart {
  const fields = parseTemplate(wikitext, templatePattern(GUP_TEMPLATE)) ?? {}
  const numbers = fields.no ?? ''
  const items: FandomItemRef[] = []

  for (const match of numbers.matchAll(ITEM_NUMBER)) {
    const label = /^\s*\(([^)]{1,60})\)/.exec(numbers.slice(match.index + match[0].length))
    items.push({ id: match[1]!, variant: label?.[1]?.trim() })
  }

  return { title, partsType: fields['parts type'] || undefined, items }
}

/** One box: an article's Technical Info List row, flattened. */
export interface FandomKitVariant {
  /** Source article. CC-BY-SA, so attribution travels with the data. */
  title: string
  /** Item numbers this row covers; a re-release shares one row. */
  ids: string[]
  variant?: string
  chassis?: string
  gearRatio?: string
  motor?: string
  /** Wheels and tires as one phrase; the wiki splits each across two fields. */
  wheel?: string
  tire?: string
}

/** "[[VS Chassis|VS]]" -> "VS". Chassis and materials are usually linked. */
const unlink = (value: string) => value.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')

/**
 * Wiki field values are free text with markup in them. "n/a" is dropped so an
 * explicit blank reads the same as an absent field.
 */
function plain(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const text = unlink(value)
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text && text.toLowerCase() !== 'n/a' ? text : undefined
}

const KIT_PATTERN = templatePattern(KIT_TEMPLATE)

/** Pure parser for one car article's variant rows. */
export function parseKitArticle(title: string, wikitext: string): FandomKitVariant[] {
  return parseTemplates(wikitext, KIT_PATTERN).map((fields) => {
    // The wiki records a wheel as size + type ("Small", "Low-Profile Fin-Type")
    // and we want the one phrase a builder row can show.
    const phrase = (...keys: string[]) =>
      keys.map(key => plain(fields[key])).filter(Boolean).join(' ') || undefined

    return {
      title,
      ids: [...(fields['item number'] ?? '').matchAll(ITEM_NUMBER)].map(match => match[1]!),
      variant: plain(fields.variant),
      chassis: plain(fields['chassis type']),
      gearRatio: plain(fields.gear),
      motor: plain(fields.motor),
      wheel: phrase('wheel size', 'wheel type'),
      tire: phrase('tire size', 'tire type')
    }
  })
}

interface EmbeddedIn {
  query: { embeddedin: { title: string }[] }
  continue?: Record<string, string>
}

interface Revisions {
  query: {
    pages: Record<string, {
      title: string
      revisions?: { slots: { main: { '*': string } } }[]
    }>
  }
}

const api = (params: Record<string, string>) =>
  `${API}?${new URLSearchParams({ ...params, format: 'json' })}`

/** Every article that transcludes a template, following the continuation. */
async function listTranscluders(template: string, noCache: boolean): Promise<string[]> {
  const titles: string[] = []
  let cursor: Record<string, string> = {}

  do {
    const page = await fetchJson<EmbeddedIn>(
      api({ action: 'query', list: 'embeddedin', eititle: template, eilimit: '500', ...cursor }),
      { noCache }
    )
    titles.push(...page.query.embeddedin.map(entry => entry.title))
    cursor = page.continue ?? {}
  } while (Object.keys(cursor).length)

  return titles
}

/**
 * Wikitext of every article transcluding a template. The API takes 50 titles
 * per request, so a whole template's worth costs a handful of requests rather
 * than one per article.
 */
async function fetchArticles(template: string, noCache: boolean) {
  const titles = await listTranscluders(template, noCache)
  const articles: { title: string, wikitext: string }[] = []

  for (let i = 0; i < titles.length; i += 50) {
    const page = await fetchJson<Revisions>(
      api({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: titles.slice(i, i + 50).join('|')
      }),
      { noCache }
    )
    for (const entry of Object.values(page.query.pages)) {
      const wikitext = entry.revisions?.[0]?.slots.main['*']
      if (wikitext) articles.push({ title: entry.title, wikitext })
    }
    progress('articles', Math.min(i + 50, titles.length), titles.length)
  }
  console.log('')

  return articles
}

export async function scrapeFandomParts(noCache = false): Promise<FandomPart[]> {
  return (await fetchArticles(GUP_TEMPLATE, noCache))
    .map(article => parseGupArticle(article.title, article.wikitext))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function scrapeFandomKits(noCache = false): Promise<FandomKitVariant[]> {
  return (await fetchArticles(KIT_TEMPLATE, noCache))
    .flatMap(article => parseKitArticle(article.title, article.wikitext))
    // A row whose Item number holds nothing we recognise (Mini-F and Type-1
    // cars, mostly) can never join to a Tamiya item, so it would only pad the
    // snapshot and its diffs.
    .filter(variant => variant.ids.length)
    .sort((a, b) => a.title.localeCompare(b.title)
      || (a.variant ?? '').localeCompare(b.variant ?? ''))
}
