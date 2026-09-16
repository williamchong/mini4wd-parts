<script setup lang="ts">
/**
 * One chassis: what it is, what a bare runner of it comes with, which boxes
 * contain one, and what fits it (docs/PLAN.md §6 M1b).
 *
 * Eight pages, and they are what makes the link graph connected — the part
 * page's compatibility chips point here, and these point back into the
 * categories. Without them those chip rows are dead text on 764 pages.
 *
 * Two lists are aggregated away before the return rather than rendered whole.
 * `compatibleParts` runs to 172–248 item numbers, which as rows would be a
 * second, worse category page; as counts per category it is ~25 links that
 * each land somewhere already built.
 */
import { newBuild } from '#shared/catalog/build'
import { encodeBuild } from '#shared/catalog/share'
import type { ChassisId, PartCategory } from '#shared/catalog/schema'

definePageMeta({ layout: 'content' })

const route = useRoute()
const { t, locale } = useI18n()
const { term, slotLabel } = useTerm()
const { resolve, isFallback, label: labelFor } = useCatalogName()
const localePath = useLocalePath()
const siteUrl = useRuntimeConfig().public.siteUrl

const id = computed(() => String(route.params.id) as ChassisId)

// Keyed by locale as well as id, because unlike a part page this loader reads
// the locale: `notes` is Traditional Chinese only and is dropped rather than
// shipped unread to the English route. One key for both would hand whichever
// payload arrived first to the other locale on a client-side switch.
const { data } = await useAsyncData(() => `chassis-${locale.value}-${id.value}`, async () => {
  // None of the three reads the others: the kit query keys on the route param
  // and the part query takes every row, so they start together.
  const [doc, kitDocs, partDocs] = await Promise.all([
    queryCollection('chassis')
      .select('id', 'stem', 'names', 'thumbnail', 'detailThumbnail', 'family', 'motorPosition',
        'motorShaft', 'releaseYear', 'kitGearRatio', 'wheelbaseMm', 'treadFrontMm', 'treadRearMm',
        'weightG', 'status', 'notes', 'slots', 'defaultLoadout', 'compatibleParts')
      .where('stem', '=', `chassis/${id.value}`)
      .first(),
    queryCollection('kits')
      .select('id', 'stem', 'names', 'thumbnail')
      .where('chassis', '=', id.value)
      .all(),
    // Two columns over every part, to tally the compatibility list by category.
    // Not `names`: that is 36 KB of names to read at most one of them below.
    queryCollection('parts').select('id', 'stem', 'category').all()
  ])
  if (!doc) return null

  // `compatibleParts` is taken for the tally and dropped: 235 item numbers in
  // every payload to render 25 links would be the whole point of column
  // discipline thrown away one field at a time. `slots` keeps only what the
  // page reads — `mirror` and `required` belong to the rule engine — and a
  // loadout entry's `source` is provenance for the generator, not the reader.
  const { compatibleParts, slots, defaultLoadout, notes, ...rest } = fromContent('chassis')(doc)

  const chassis = {
    ...rest,
    notes: locale.value === 'en' ? undefined : notes,
    slots: slots.map(({ id: slotId, type, maxCount }) => ({ id: slotId, type, maxCount })),
    defaultLoadout: Object.fromEntries(Object.entries(defaultLoadout).map(([slotId, entries]) =>
      [slotId, entries.map(({ partId, label }) => ({ partId, label }))]))
  }

  const compatible = new Set(compatibleParts)
  const counts = new Map<PartCategory, number>()
  for (const part of partDocs) {
    if (compatible.has(itemId(part))) counts.set(part.category, (counts.get(part.category) ?? 0) + 1)
  }

  // At most one entry on any chassis — five of the eight name a propeller shaft
  // and the other three name nothing — so this is one extra query on five of
  // the sixteen routes rather than a `names` column on 382 rows of all of them.
  const loadoutIds = [...new Set(Object.values(chassis.defaultLoadout).flat()
    .map(entry => entry.partId)
    .filter(partId => partId !== undefined))]

  const loadoutDocs = await Promise.all(loadoutIds.map(partId =>
    queryCollection('parts').select('id', 'stem', 'names').where('stem', '=', `parts/${partId}`).first()))

  return {
    chassis,
    kits: kitDocs.map(fromContent('kits')).sort((a, b) => a.id.localeCompare(b.id)),
    loadoutNames: Object.fromEntries(loadoutDocs
      .filter(part => part !== null)
      .map(part => [itemId(part), part.names])),
    compatTotal: compatible.size,
    categories: [...counts]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
  }
})

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: t('chassis.notFound'), fatal: true })
}

const chassis = computed(() => data.value!.chassis)
const name = computed(() => resolve(chassis.value.names).value)

/** The 320x240 copy, on the same fallback the part page uses. */
const photo = computed(() => chassis.value.detailThumbnail ?? chassis.value.thumbnail)

/**
 * The same union of spec rows the part page builds, assembled by hand here
 * because a chassis' specs are its own fields rather than a `PartSpecs` blob —
 * `specRowsForPart` has nothing to read.
 */
const specs = computed(() => {
  const entry = chassis.value
  const tread = entry.treadFrontMm === entry.treadRearMm
    ? entry.treadFrontMm
    : [entry.treadFrontMm, entry.treadRearMm].filter(Boolean).join(' / ')
  return [
    { key: 'family', value: t(`chassis.family.${entry.family}`) },
    { key: 'motorPosition', value: t(`build.motorPosition.${entry.motorPosition}`) },
    { key: 'motorShaft', value: t(`spec.shaft.${entry.motorShaft}`) },
    { key: 'gearRatio', value: entry.kitGearRatio },
    { key: 'wheelbase', value: entry.wheelbaseMm && `${entry.wheelbaseMm}mm` },
    { key: 'tread', value: tread && `${tread}mm` },
    { key: 'weight', value: entry.weightG && `${entry.weightG}g` },
    { key: 'releaseYear', value: String(entry.releaseYear) },
    { key: 'status', value: t(`chassis.status.${entry.status}`) }
  ].filter((row): row is { key: string, value: string } => Boolean(row.value))
})

/**
 * The bare runner's contents in the chassis' own slot order, which is the order
 * the builder lists them in. A slot the runner does not fill — the body, most
 * of the stays — is left out rather than printed empty.
 */
const loadout = computed(() =>
  chassis.value.slots
    .map(slot => ({
      slot,
      entries: (chassis.value.defaultLoadout[slot.id] ?? []).map((entry) => {
        const names = entry.partId ? data.value?.loadoutNames[entry.partId] : undefined
        // A catalog part marks its fallback the way every part row does; a bare
        // label carries its own, since it may have no locale we serve at all.
        if (names) {
          return { partId: entry.partId, text: resolve(names).value, fallback: isFallback(names) }
        }
        const label = entry.label && labelFor(entry.label)
        // An item number we hold no record for still names itself.
        return { partId: entry.partId, text: label?.value ?? entry.partId, fallback: !!label?.fallback }
      })
    }))
    .filter(row => row.entries.length))

/**
 * Our own prose about the chassis, and the one field on the record that is
 * Traditional Chinese only. An English reader gets the specs, not a paragraph
 * they cannot read (§6 M1b, left open deliberately).
 */
const notes = computed(() => locale.value === 'en' ? undefined : chassis.value.notes)

/**
 * A kit row opens the builder on that kit, because kit pages do not exist yet
 * and this is the question a chassis page is actually asked: which box on the
 * shelf has one of these in it. The hash is the builder's own share format, so
 * this reuses `encodeBuild` rather than inventing a second entry point — and
 * Google ignores a hash, so these are an affordance and not internal links.
 */
const kitLinks = computed(() => {
  const path = localePath('/')
  return new Map((data.value?.kits ?? []).map(kit =>
    [kit.id, { path, hash: `#${encodeBuild(newBuild(id.value, kit.id))}` }]))
})

const buildLink = (kit: { id: string }) => kitLinks.value.get(kit.id) ?? localePath('/')

const title = computed(() => `${name.value} — ${t('site.title')}`)

const description = computed(() => t('chassis.pageDescription', {
  name: name.value,
  motor: t(`build.motorPosition.${chassis.value.motorPosition}`),
  year: chassis.value.releaseYear,
  kits: data.value?.kits.length ?? 0
}))

const image = computed(() => photo.value && `${siteUrl}${photo.value}`)

useHead(() => ({
  title: title.value,
  meta: [
    { name: 'description', content: description.value },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: description.value },
    ...(image.value ? [{ property: 'og:image', content: image.value }] : [])
  ]
}))
</script>

<template>
  <article class="part-page">
    <Breadcrumbs :trail="[{ to: '/chassis', label: $t('chassis.title') }, { label: name }]" />

    <header class="part-hero">
      <CatalogThumb
        class="part-photo"
        :src="photo"
        icon="chassis"
        :variant="chassis.detailThumbnail ? 'detail' : 'row'"
      />

      <div class="part-hero-text">
        <p class="part-eyebrow">
          <span>{{ $t(`chassis.family.${chassis.family}`) }}</span>
          <span>{{ $t(`chassis.status.${chassis.status}`) }}</span>
        </p>

        <h1>{{ name }}</h1>

        <p class="part-facts">
          <span>{{ $t(`build.motorPosition.${chassis.motorPosition}`) }}</span>
          <span>{{ chassis.releaseYear }}</span>
        </p>

        <p v-if="notes" class="chassis-notes">{{ notes }}</p>
      </div>
    </header>

    <section class="part-section">
      <h2>{{ $t('chassis.specs') }}</h2>
      <dl class="part-table">
        <template v-for="spec in specs" :key="spec.key">
          <dt>{{ $t(`spec.${spec.key}`) }}</dt>
          <dd>{{ spec.value }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="loadout.length" class="part-section">
      <h2>{{ $t('chassis.defaultLoadout') }}</h2>
      <p class="part-note">{{ $t('chassis.loadoutNote') }}</p>
      <dl class="part-table">
        <template v-for="row in loadout" :key="row.slot.id">
          <dt>{{ slotLabel(row.slot) }}</dt>
          <dd>
            <ul class="loadout-entries">
              <li v-for="(entry, index) in row.entries" :key="entry.partId ?? index">
                <NuxtLink v-if="entry.partId" :to="localePath(`/parts/${entry.partId}`)">
                  {{ entry.text }}
                </NuxtLink>
                <!-- Most of what comes on a runner is moulded plastic Tamiya
                     never sold separately, so a label with no item number is
                     the normal case rather than a gap (§4.7). -->
                <span v-else :class="{ fallback: entry.fallback }">{{ entry.text }}</span>
              </li>
            </ul>
          </dd>
        </template>
      </dl>
    </section>

    <section class="part-section">
      <h2>{{ $t('chassis.slots') }}</h2>
      <ul class="chip-row">
        <li v-for="slot in chassis.slots" :key="slot.id" class="chip">
          {{ slotLabel(slot) }}
          <span v-if="slot.maxCount > 1" class="chip-count">
            {{ $t('chassis.maxCount', { count: slot.maxCount }) }}
          </span>
        </li>
      </ul>
    </section>

    <section v-if="data!.categories.length" class="part-section">
      <h2>{{ $t('chassis.compatParts') }}</h2>
      <p class="part-note">{{ $t('chassis.compatNote', { count: data!.compatTotal }) }}</p>
      <ul class="chip-row">
        <li v-for="entry in data!.categories" :key="entry.category">
          <NuxtLink class="chip" :to="localePath(`/parts/category/${entry.category}`)">
            {{ term(entry.category, `part.category.${entry.category}`) }}
            <span class="chip-count">{{ entry.count }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section v-if="data!.kits.length" class="part-section">
      <h2>{{ $t('chassis.kits') }}</h2>
      <p class="part-note">
        {{ $t('chassis.kitsCount', { count: data!.kits.length }) }} — {{ $t('chassis.kitsNote') }}
      </p>
      <PartLinkList :parts="data!.kits" icon="body" :to="buildLink" />
    </section>

    <p class="image-credit">{{ $t('build.imageCredit') }}</p>
  </article>
</template>
