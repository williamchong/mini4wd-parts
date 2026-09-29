<script setup lang="ts">
/**
 * One kit, on its own page: the box art, what is in the box slot by slot, the
 * chassis it is built on, and a button that opens the builder on it
 * (docs/PLAN.md §4.7, scoped 2026-09-29).
 *
 * Prerendered per locale, 305 × 2 routes. Until this page existed every kit row
 * on the site opened the builder through a `#hash`, which a crawler ignores, so
 * the 305 boxes a beginner searches for by name had no page to land on. The
 * builder is still where the reader ends up; this page is the door with a URL.
 *
 * The loadout table is the same resolution the builder does — the chassis'
 * `defaultLoadout` under the kit's `stockLoadout` delta (§4.7) — so the two
 * can never disagree about what a box holds.
 */
import { newBuild, resolveBuild } from '#shared/catalog/build'
import { fandomArticleUrl, orderKits } from '#shared/catalog/kits'
import type { ResolvedEntry } from '#shared/catalog/build'
import { KIT_PAGE_ENTRY } from '~/composables/useAnalytics'

definePageMeta({ layout: 'content' })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { resolve, isFallback, label: resolveLabel } = useCatalogName()
const { slotLabel } = useTerm()
const siteUrl = useRuntimeConfig().public.siteUrl

const id = computed(() => String(route.params.id))

/** Item number, name and picture — all a link to another kit needs. */
const STUB = ['id', 'stem', 'names', 'thumbnail'] as const

/** The other boxes on the same chassis, newest first, as the picker orders them. */
const RELATED_MAX = 8

const { data } = await useAsyncData(() => `kit-${id.value}`, async () => {
  const doc = await queryCollection('kits')
    .select('id', 'stem', 'names', 'series', 'seriesNumber', 'chassis', 'gearRatio', 'stockLoadout',
      'loadoutSource', 'loadoutSourceTitle', 'priceJpy', 'releaseDate', 'status',
      'officialUrl', 'hkStoreUrl', 'thumbnail', 'detailThumbnail')
    .where('stem', '=', `kits/${id.value}`)
    .first()
  if (!doc) return null
  const kit = fromContent('kits')(doc)

  // Both key on the kit's chassis, neither on the other, so they run together.
  const [chassisDoc, siblingDocs] = await Promise.all([
    queryCollection('chassis')
      .select('id', 'stem', 'names', 'slots', 'defaultLoadout', 'motorShaft', 'rearRollersPerSide')
      .where('stem', '=', `chassis/${kit.chassis}`)
      .first(),
    // `releaseDate` is read for the order and dropped before the payload.
    queryCollection('kits').select(...STUB, 'releaseDate').where('chassis', '=', kit.chassis).all()
  ])
  if (!chassisDoc) return null
  const chassis = fromContent('chassis')(chassisDoc)

  /**
   * The box resolved over its chassis, kept to the slots that hold something.
   * `mirror` and `required` are the rule engine's and never reach the payload.
   */
  const loadout = resolveBuild(chassis, kit, newBuild(chassis.id, kit.id))
    .filter(slot => slot.entries.length)
    .map(({ id: slotId, type, entries }) => ({
      id: slotId,
      type,
      // Spread only what is set: an explicit `undefined` is still a key in
      // the serialised payload, on every entry of every kit.
      entries: entries.map(({ partId, label, origin }): Pick<ResolvedEntry, 'partId' | 'label' | 'origin'> =>
        ({ ...(partId ? { partId } : {}), ...(label ? { label } : {}), origin }))
    }))

  // The few stock pieces sold as products — a motor, a propeller shaft, a
  // starter pack's dampers — are named from their own records and linked.
  const partIds = [...new Set(loadout.flatMap(slot => slot.entries.flatMap(entry => entry.partId ? [entry.partId] : [])))]
  const partDocs = partIds.length
    ? await queryCollection('parts').select('id', 'stem', 'names')
      .where('stem', 'IN', partIds.map(partId => `parts/${partId}`)).all()
    : []

  const siblings = orderKits(siblingDocs.map(fromContent('kits')))
    .filter(other => other.id !== kit.id)

  // `stockLoadout` was an input to the resolution above and is not read again;
  // shipped, its per-locale labels would sit in the payload twice.
  const { stockLoadout: _stockLoadout, ...kitRest } = kit

  return {
    kit: kitRest,
    chassis: { id: chassis.id, names: chassis.names },
    loadout,
    partNames: Object.fromEntries(partDocs.map(part => [itemId(part), part.names])),
    siblings: siblings.slice(0, RELATED_MAX).map(({ releaseDate: _date, ...stub }) => stub),
    siblingTotal: siblings.length
  }
})

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: t('kit.notFound'), fatal: true })
}

const kit = computed(() => data.value!.kit)

const name = computed(() => resolve(kit.value.names).value)
const fallback = computed(() => isFallback(kit.value.names))
const chassisName = computed(() => resolve(data.value!.chassis.names).value)

/** The 320×240 copy, on the same fallback the part page uses. */
const photo = computed(() => kit.value.detailThumbnail ?? kit.value.thumbnail)

/**
 * Each filled slot as text, one line per entry. A catalog part names itself
 * from its record and links to its page; a moulded piece has only its label,
 * which may carry no locale this page serves — a wiki phrase we have not
 * translated — and then the slot's own name stands in, as the builder does.
 */
const rows = computed(() => data.value!.loadout.map((slot) => {
  const entries = slot.entries.map((entry, index) => {
    const names = entry.partId ? data.value!.partNames[entry.partId] : undefined
    const hit = names
      ? { value: resolve(names).value, fallback: isFallback(names) }
      : entry.label ? resolveLabel(entry.label) : undefined
    return {
      // By position: a starter pack puts the same damper part in a slot twice.
      key: index,
      text: hit?.value ?? slotLabel(slot),
      fallback: hit?.fallback ?? false,
      partId: entry.partId,
      fromChassis: entry.origin === 'chassis'
    }
  })
  return { id: slot.id, label: slotLabel(slot), entries, fromChassis: entries.every(entry => entry.fromChassis) }
}))

/** How many rows are the chassis' own rather than the box's, for the footnote. */
const chassisRows = computed(() => rows.value.filter(row => row.fromChassis).length)

const NAME_LOCALES = ['ja', 'en', 'zh-HK', 'zh-TW'] as const

const otherNames = computed(() => {
  const shown = resolve(kit.value.names).from
  return NAME_LOCALES
    .filter(key => key !== shown && kit.value.names[key])
    .map(key => ({ key, value: kit.value.names[key]! }))
})

const wikiUrl = computed(() =>
  kit.value.loadoutSourceTitle ? fandomArticleUrl(kit.value.loadoutSourceTitle) : undefined)

/**
 * The page's action. `from: 'kit_page'` is how the builder tells this button
 * apart from a pasted link when it counts the build's start.
 */
const kitBuildLink = useKitBuildLink()
const buildLink = computed(() => kitBuildLink(kit.value.chassis, kit.value.id, KIT_PAGE_ENTRY))

const series = computed(() => t(`kit.series.${kit.value.series}`))

const title = computed(() => `${name.value}（${kit.value.id}）— ${t('site.title')}`)

/** Our own sentence about the box: what car, what chassis, what series. */
const description = computed(() => t('kit.description', {
  name: name.value,
  id: kit.value.id,
  chassis: chassisName.value,
  series: series.value
}))

const image = computed(() => photo.value && `${siteUrl}${photo.value}`)

useHead(() => ({
  title: title.value,
  meta: [
    { name: 'description', content: description.value },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: description.value },
    ...(kit.value.detailThumbnail ? thumbnailShareMeta(`${siteUrl}${kit.value.detailThumbnail}`) : [])
  ],
  script: [{
    type: 'application/ld+json',
    // No `offers`, for the reason the part page gives: we sell nothing.
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': name.value,
      'sku': kit.value.id,
      'category': series.value,
      'brand': { '@type': 'Brand', 'name': 'TAMIYA' },
      ...(image.value ? { image: image.value } : {}),
      'url': `${siteUrl}${localePath(`/kits/${kit.value.id}`)}`
    })
  }]
}))

const kitPage = (entry: { id: string }) => localePath(`/kits/${entry.id}`)
</script>

<template>
  <article class="part-page">
    <!-- A kit lives under its chassis, whatever its URL says (§4.6). -->
    <Breadcrumbs
      :trail="[
        { to: '/chassis', label: $t('chassis.title') },
        { to: `/chassis/${kit.chassis}`, label: chassisName },
        { label: name }
      ]"
    />

    <header class="part-hero">
      <CatalogThumb
        class="part-photo"
        :src="photo"
        icon="body"
        :variant="kit.detailThumbnail ? 'detail' : 'row'"
      />

      <div class="part-hero-text">
        <p class="part-eyebrow">
          <span>{{ series }}</span>
          <span v-if="kit.seriesNumber">{{ $t('kit.seriesNumber', { number: kit.seriesNumber }) }}</span>
          <span class="part-id">{{ kit.id }}</span>
        </p>

        <h1 :class="{ fallback }">{{ name }}</h1>

        <p class="part-facts">
          <NuxtLink :to="localePath(`/chassis/${kit.chassis}`)">{{ chassisName }}</NuxtLink>
          <span v-if="kit.gearRatio">{{ $t('kit.gearRatio', { ratio: kit.gearRatio }) }}</span>
          <span v-if="kit.priceJpy">¥{{ kit.priceJpy }}</span>
          <span v-if="kit.releaseDate">{{ kit.releaseDate }}</span>
          <UBadge v-if="kit.status === 'limited'" color="warning" variant="subtle" size="sm">
            {{ $t('part.status.limited') }}
          </UBadge>
        </p>

        <UButton size="lg" class="part-cta" :to="buildLink">
          {{ $t('kit.startBuild') }}
        </UButton>
      </div>
    </header>

    <!-- What is in the box is the whole question a reader opens this page
         with, so it comes first. -->
    <section v-if="rows.length" class="part-section">
      <h2>{{ $t('kit.loadout') }}</h2>
      <!-- The credit sits with what it covers: the table below is the wiki's
           work, and the licence asks that the page using it says so (§4.7).
           For the kits with no wiki row it says instead why the table is the
           chassis' own. -->
      <BuildKitCredit :kit="kit" />
      <p v-if="wikiUrl" class="part-note">{{ $t('kit.loadoutNote') }}</p>
      <dl class="part-table">
        <template v-for="row in rows" :key="row.id">
          <dt>{{ row.label }}</dt>
          <dd>
            <ul class="loadout-entries">
              <li v-for="entry in row.entries" :key="entry.key" :class="{ fallback: entry.fallback }">
                <NuxtLink v-if="entry.partId" :to="localePath(`/parts/${entry.partId}`)">
                  {{ entry.text }}
                </NuxtLink>
                <template v-else>{{ entry.text }}</template>
                <!-- The chassis' own piece, not something this box adds: the
                     distinction the delta is stored to keep (§4.7). -->
                <span v-if="entry.fromChassis" class="kit-origin">{{ $t('kit.fromChassis') }}</span>
              </li>
            </ul>
          </dd>
        </template>
      </dl>
      <p v-if="chassisRows" class="part-note">
        {{ $t('kit.loadoutChassisNote', { count: chassisRows, chassis: chassisName }) }}
      </p>
    </section>

    <section v-if="otherNames.length" class="part-section">
      <h2>{{ $t('part.otherNames') }}</h2>
      <dl class="part-table">
        <template v-for="entry in otherNames" :key="entry.key">
          <dt>{{ $t(`part.localeName.${entry.key}`) }}</dt>
          <dd>{{ entry.value }}</dd>
        </template>
      </dl>
    </section>

    <section class="part-section">
      <h2>{{ $t('part.links') }}</h2>
      <ul class="part-links">
        <li>
          <a :href="kit.officialUrl" target="_blank" rel="noopener">{{ $t('part.official') }}</a>
        </li>
        <li v-if="kit.hkStoreUrl">
          <a :href="kit.hkStoreUrl" target="_blank" rel="noopener">{{ $t('part.hkStore') }}</a>
        </li>
        <li v-if="wikiUrl">
          <a :href="wikiUrl" target="_blank" rel="noopener">
            {{ $t('part.wiki', { title: kit.loadoutSourceTitle }) }}
          </a>
        </li>
      </ul>
    </section>

    <section v-if="data!.siblings.length" class="part-section">
      <h2 class="part-section-head">
        <span>{{ $t('kit.sameChassis', { chassis: chassisName }) }}</span>
        <NuxtLink :to="localePath(`/chassis/${kit.chassis}`)">
          {{ $t('kit.seeAllOnChassis', { count: data!.siblingTotal }) }}
        </NuxtLink>
      </h2>
      <PartLinkList :parts="data!.siblings" icon="body" :to="kitPage" />
    </section>

    <ImageCredit />
  </article>
</template>
