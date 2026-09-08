import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { ROOT } from './fetch.ts'

/** Repo-relative file readers, shared by generate/report/verify/taxonomy. */

export const readJsonFile = <T>(path: string): T =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T

export const readYamlFile = <T>(path: string): T =>
  parse(readFileSync(join(ROOT, path), 'utf8')) as T

/** Same, but tolerating an absent file — used for the optional overrides. */
export function readYamlFileIfPresent<T>(path: string, fallback: T): T {
  try {
    return (parse(readFileSync(join(ROOT, path), 'utf8')) as T) ?? fallback
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

/** Every .yml file in a repo-relative directory, in filename order. */
export function readYamlDir<T>(dir: string): { name: string, data: T }[] {
  const target = join(ROOT, dir)
  return readdirSync(target)
    .filter(name => name.endsWith('.yml'))
    .sort()
    .map(name => ({ name, data: parse(readFileSync(join(target, name), 'utf8')) as T }))
}
