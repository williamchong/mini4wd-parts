import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const CACHE_DIR = join(ROOT, '.cache/scrape')

/**
 * Identify ourselves. Tamiya publishes no robots.txt, so the polite thing is a
 * UA that says who we are and where to complain, plus the throttling below.
 */
const USER_AGENT =
  'mini4wd-parts-catalog/0.1 (+https://mini4wd.parts; one-off catalog build, throttled)'

const MIN_INTERVAL_MS = 700
const MAX_RETRIES = 3

let chain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0
let cacheReady: Promise<unknown> | undefined

/** Serialise every request and space them out, whatever the caller does. */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    return task()
  })
  chain = run.catch(() => {})
  return run as Promise<T>
}

function cachePath(url: string) {
  return join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.txt`)
}

/** The cache directory is flat, so it only ever needs creating once per run. */
function ensureCacheDir() {
  cacheReady ??= mkdir(CACHE_DIR, { recursive: true })
  return cacheReady
}

/**
 * Tamiya serves Shift_JIS. Node's WHATWG decoder implements it as Windows-31J,
 * which is what the pages actually contain — a strict Shift_JIS decoder (iconv)
 * aborts on the NEC extension characters in item names and silently truncates
 * the document to a fraction of its items.
 */
function decode(buffer: ArrayBuffer, contentType: string | null) {
  const charset = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase()
  const label = charset === 'shift_jis' || charset === 'sjis' || charset === 'windows-31j'
    ? 'shift_jis'
    : charset || 'utf-8'
  return new TextDecoder(label).decode(buffer)
}

export interface FetchOptions {
  /** Skip the disk cache for this request. */
  noCache?: boolean
  /** Expect JSON rather than an HTML page. */
  json?: boolean
}

/** Fetch a URL as text, cached on disk and throttled. */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const file = cachePath(url)
  if (!options.noCache) {
    try {
      return await readFile(file, 'utf8')
    }
    catch {
      // Not cached yet.
    }
  }

  const body = await schedule(async () => {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'user-agent': USER_AGENT,
            'accept': options.json ? 'application/json' : 'text/html,*/*;q=0.8',
            'accept-language': 'ja,en;q=0.8'
          },
          signal: AbortSignal.timeout(30_000)
        })
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status} for ${url}`)
          // A 404 or 403 will not fix itself; only retry transient failures.
          if (response.status >= 400 && response.status < 500) throw Object.assign(error, { fatal: true })
          throw error
        }
        return decode(await response.arrayBuffer(), response.headers.get('content-type'))
      }
      catch (error) {
        lastError = error
        if ((error as { fatal?: boolean }).fatal) break
        if (attempt < MAX_RETRIES) await sleep(1000 * 2 ** attempt)
      }
    }
    throw lastError
  })

  await ensureCacheDir()
  await writeFile(file, body, 'utf8')
  return body
}

/**
 * WordPress endpoints can answer 200 with an HTML maintenance or WAF page. If
 * that body reached the cache, every later run would replay the same
 * unparseable response, so drop the cache entry when the JSON does not parse.
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const body = await fetchText(url, { ...options, json: true })
  try {
    return JSON.parse(body) as T
  }
  catch (error) {
    await rm(cachePath(url), { force: true })
    throw new Error(`Non-JSON response from ${url}: ${(error as Error).message}`)
  }
}

/** Progress line that overwrites itself, so a 900-request run stays readable. */
export function progress(label: string, done: number, total: number) {
  const line = `  ${label}: ${done}/${total}`
  if (process.stdout.isTTY) process.stdout.write(`\r${line.padEnd(60)}`)
  else if (done === total) console.log(line)
}
