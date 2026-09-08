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
const ITEM_NUMBER = /\b((?:10|15|18|19|49|55|84|94|95)\d{3})\b/g

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
 * Pure parser for one `{{Template|k = v|…}}` call. Keys are lower-cased and
 * lose a trailing dot, because the wiki writes both "No." and "No".
 *
 * Returns undefined for an unterminated template rather than guessing where it
 * ended: the closing `}}` is what tells us `i - 2` is the end of the body, and
 * without it the last field silently loses its final two characters.
 */
export function parseTemplate(text: string, name: RegExp): Record<string, string> | undefined {
  const opening = new RegExp(`\\{\\{\\s*${name.source}\\s*`, name.flags.replace('g', ''))
  const start = opening.exec(text)
  if (!start) return undefined

  let depth = 1
  let i = start.index + start[0].length
  const from = i
  while (i < text.length && depth > 0) {
    const pair = text.slice(i, i + 2)
    if (pair === '{{') { depth += 1; i += 2 }
    else if (pair === '}}') { depth -= 1; i += 2 }
    else i += 1
  }
  if (depth > 0) return undefined

  const fields: Record<string, string> = {}
  for (const param of splitParams(text.slice(from, i - 2))) {
    const split = param.indexOf('=')
    if (split === -1) continue
    const key = param.slice(0, split).trim().replace(/\.$/, '').trim().toLowerCase()
    if (key) fields[key] = param.slice(split + 1).trim()
  }
  return fields
}

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
 * The API takes 50 titles per request, so the whole wiki costs ~3 requests
 * rather than one per article.
 */
export async function scrapeFandomParts(noCache = false): Promise<FandomPart[]> {
  const titles = await listTranscluders(GUP_TEMPLATE, noCache)
  const parts: FandomPart[] = []

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
      if (wikitext) parts.push(parseGupArticle(entry.title, wikitext))
    }
    progress('articles', Math.min(i + 50, titles.length), titles.length)
  }
  console.log('')

  return parts.sort((a, b) => a.title.localeCompare(b.title))
}
