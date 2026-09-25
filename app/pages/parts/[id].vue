<script setup lang="ts">
/**
 * One part, on its own page: the picture, the facts we hold, the way back to
 * Tamiya, and a button that puts it on the car (docs/PLAN.md §6 M1b).
 *
 * Prerendered per locale, 382 × 2 routes, which is why the query below names
 * its columns twice over — once for the record itself, once for the stubs
 * beside it. Whole records would put every part's raw Japanese spec text in
 * front of a reader who wanted a roller's diameter, and `specsRaw` is Tamiya's
 * own prose, which we store to parse and may not republish (CLAUDE.md).
 *
 * The add-to-build button deliberately does not decide anything: see
 * useAddToBuild.ts.
 */
import { fitsAnyChassis, goesOnCar, setContentRows } from '#shared/catalog/build'
import { fandomArticleUrl, FANDOM_WIKI } from '#shared/catalog/kits'
import type { BuildClass } from '#shared/catalog/build'
import type { Part } from '#shared/catalog/schema'
import type { IconName } from '~/utils/icons'

definePageMeta({ layout: 'content' })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { resolve, isFallback } = useCatalogName()
const { term, slotTypeLabel, categoryIntro } = useTerm()
const siteUrl = useRuntimeConfig().public.siteUrl

const id = computed(() => String(route.params.id))

/**
 * Item number, name and picture — all a link to another part needs.
 *
 * The thumbnail path is shipped as the string rather than as `flagThumbnail`'s
 * boolean, which is the opposite of what the builder does. The reason the
 * builder derives it is 631 records in one payload (shared/catalog/
 * thumbnails.ts); here it is one record plus at most twenty stubs — 33 bytes
 * gzipped, measured — and carrying the path keeps this page free of a second
 * flag for the detail size.
 */
const STUB = ['id', 'stem', 'names', 'thumbnail'] as const

/**
 * What a parts set puts on the car, row by row, for the box's own page.
 *
 * `setContentRows` resolves the slot ids to the slot types this page can name;
 * all this adds is the query for the profiles it reads them from and the stub
 * for each item number. It costs two queries on the 5 part pages that have
 * contents and nothing on the other 377, and only the rows reach the payload.
 *
 * A piece with no separate SKU is the set's own item number (schema.ts), which
 * matches no stub and the page prints as what it is rather than as a link to
 * the page the reader is already on.
 */
async function setContents(part: Pick<Part, 'id' | 'contents'>) {
  if (!part.contents) return []
  const ids = [...new Set(Object.values(part.contents).flat())].filter(entry => entry !== part.id)

  // By `stem`, not by `id`: @nuxt/content overwrites a record's own `id` with
  // its source path, and `fromContent` is what puts the item number back.
  const [profiles, contents] = await Promise.all([
    queryCollection('chassis').select('slots').all(),
    ids.length
      ? queryCollection('parts').select(...STUB)
          .where('stem', 'IN', ids.map(entry => `parts/${entry}`)).all()
          .then(rows => rows.map(fromContent('parts')))
      : []
  ])
  const stubs = new Map(contents.map(entry => [entry.id, entry]))

  return setContentRows(part, profiles)
    .map(row => ({ type: row.type, parts: row.partIds.map(entry => stubs.get(entry) ?? null) }))
}

const { data } = await useAsyncData(() => `part-${id.value}`, async () => {
  // The chassis names do not depend on the part, so they are fetched alongside
  // it rather than in the round that does.
  const [doc, chassis] = await Promise.all([
    queryCollection('parts')
      .select('id', 'stem', 'names', 'series', 'gupNumber', 'category', 'slots', 'isCarPart', 'contents',
        'chassisCompat', 'classLegality', 'specs', 'priceJpy', 'releaseDate', 'status',
        'officialUrl', 'hkStoreUrl', 'fandomTitle', 'thumbnail', 'detailThumbnail')
      .where('stem', '=', `parts/${id.value}`)
      .first(),
    queryCollection('chassis').select('id', 'stem', 'names').all()
  ])
  if (!doc) return null
  const part = fromContent('parts')(doc)

  const [family, sameCategory, contents] = await Promise.all([
    // A part with no article has no family, and asking for `=== undefined`
    // would match every other part that has none either.
    part.fandomTitle
      ? queryCollection('parts').select(...STUB).where('fandomTitle', '=', part.fandomTitle).all()
      : Promise.resolve([]),
    queryCollection('parts').select(...STUB, 'slots').where('category', '=', part.category).all(),
    // Nothing here depends on the two above, so a set's rows are fetched in
    // this round rather than in a third one of their own.
    setContents(part)
  ])

  const variants = family.map(fromContent('parts')).filter(other => other.id !== part.id)
  const known = new Set([part.id, ...variants.map(other => other.id)])

  /**
   * Other parts of the same category, nearest first: one sharing a slot type is
   * a real alternative to this part, while the rest of the category is merely
   * adjacent. Cut to eight here rather than in the template, so the other fifty
   * never reach the payload.
   */
  const related = sameCategory
    .map(fromContent('parts'))
    .filter(other => !known.has(other.id))
    .sort((a, b) => {
      const shares = (other: typeof a) => Number(other.slots.some(slot => part.slots.includes(slot)))
      return shares(b) - shares(a) || a.id.localeCompare(b.id)
    })
    .slice(0, 8)
    .map(({ slots: _slots, ...stub }) => stub)

  return {
    part,
    variants,
    related,
    contents,
    /** For the link out to the category page; the rows themselves stay at 8. */
    categoryTotal: sameCategory.length,
    // Only the chassis this part actually fits, named. The other seven records
    // have no reason to be in 764 payloads.
    chassis: chassis.map(fromContent('chassis'))
      .filter(entry => part.chassisCompat.include.includes(entry.id))
      .map(entry => ({ id: entry.id, names: entry.names }))
  }
})

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: t('part.notFound'), fatal: true })
}

const part = computed(() => data.value!.part)

const name = computed(() => resolve(part.value.names).value)
const fallback = computed(() => isFallback(part.value.names))

/** The 320×240 copy where Tamiya's photo was big enough to make one. */
const photo = computed(() => part.value.detailThumbnail ?? part.value.thumbnail)
const icon = computed<IconName>(() => part.value.slots[0] ?? 'none')

const specs = computed(() => specRowsForPart(part.value))

/**
 * Our own taxonomy, not Tamiya's — almost every item's own label is just
 * "ミニ四駆グレードアップパーツ". Through `term` so that the two categories whose
 * Traditional Chinese wording differs by region, 摩打 and 剎車, follow the
 * reader's toggle like every other term on the site.
 */
const category = computed(() =>
  term(part.value.category, `part.category.${part.value.category}`))
const intro = computed(() => categoryIntro(part.value.category))

const CLASSES = ['open', 'stockBmax', 'junior'] as const satisfies readonly BuildClass[]

/**
 * Every name we hold except the one already shown as the title. Worth a block
 * of its own: the Japanese name is what a Japanese shop lists the part under,
 * and 40% of parts have no Traditional Chinese name at all.
 */
const NAME_LOCALES = ['ja', 'en', 'zh-HK', 'zh-TW'] as const

const otherNames = computed(() => {
  const shown = resolve(part.value.names).from
  return NAME_LOCALES
    .filter(key => key !== shown && part.value.names[key])
    .map(key => ({ key, value: part.value.names[key]! }))
})

const wikiUrl = computed(() =>
  part.value.fandomTitle ? fandomArticleUrl(part.value.fandomTitle) : undefined)

const { addToBuild } = useAddToBuild()

const buildable = computed(() => goesOnCar(part.value))

const title = computed(() => `${name.value}（${part.value.id}）— ${t('site.title')}`)

/**
 * Our own sentence about the part, not Tamiya's. It says what it is, what it
 * fits and what it costs, which is what a search result should say.
 */
const description = computed(() => {
  const chassis = data.value?.chassis ?? []
  return t('part.description', {
    name: name.value,
    id: part.value.id,
    category: category.value,
    chassis: chassis.length
      ? t('part.fits', {
          list: chassis.map(entry => resolve(entry.names).value).join(t('build.listSeparator'))
        })
      // An empty compatibility list is "fits anything", never "fits nothing".
      : t('part.compatAll')
  })
})

const image = computed(() => photo.value && `${siteUrl}${photo.value}`)

useHead(() => ({
  title: title.value,
  meta: [
    { name: 'description', content: description.value },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: description.value },
    ...(part.value.detailThumbnail ? thumbnailShareMeta(`${siteUrl}${part.value.detailThumbnail}`) : [])
  ],
  script: [{
    type: 'application/ld+json',
    // No `offers`: we do not sell the part, and a price inside an offer on a
    // site with no checkout is a claim we cannot stand behind. The JPY list
    // price is on the page as what Tamiya prints, which is what it is.
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': name.value,
      'sku': part.value.id,
      'category': category.value,
      'brand': { '@type': 'Brand', 'name': 'TAMIYA' },
      ...(image.value ? { image: image.value } : {}),
      'url': `${siteUrl}${localePath(`/parts/${part.value.id}`)}`
    })
  }]
}))
</script>

<template>
  <article class="part-page">
    <Breadcrumbs
      :trail="[
        { to: '/parts', label: $t('nav.parts') },
        { to: `/parts/category/${part.category}`, label: category },
        { label: name }
      ]"
    />

    <header class="part-hero">
      <CatalogThumb
        class="part-photo"
        :src="photo"
        :icon="icon"
        :variant="part.detailThumbnail ? 'detail' : 'row'"
      />

      <div class="part-hero-text">
        <p class="part-eyebrow">
          <span>{{ category }}</span>
          <span>{{ $t(`part.series.${part.series}`) }}</span>
          <span v-if="part.gupNumber">{{ $t('part.gupNumber', { number: part.gupNumber }) }}</span>
          <span class="part-id">{{ part.id }}</span>
        </p>

        <h1 :class="{ fallback }">{{ name }}</h1>

        <p class="part-facts">
          <span v-if="part.priceJpy">¥{{ part.priceJpy }}</span>
          <span v-if="part.releaseDate">{{ part.releaseDate }}</span>
          <UBadge v-if="part.status === 'limited'" color="warning" variant="subtle" size="sm">
            {{ $t('part.status.limited') }}
          </UBadge>
        </p>

        <UButton v-if="buildable" size="lg" class="part-cta" @click="addToBuild(part)">
          {{ part.contents ? $t('part.addSetToBuild') : $t('part.addToBuild') }}
        </UButton>
      </div>
    </header>

    <section v-if="intro" class="part-section">
      <h2>{{ $t('part.aboutCategory', { category }) }}</h2>
      <p class="part-intro">{{ intro }}</p>
      <!-- Our intro is about the category; for this part in particular, send
           the reader to the sources rather than paraphrasing them (CLAUDE.md:
           Tamiya's descriptions are not ours to copy). -->
      <i18n-t
        v-if="part.officialUrl"
        :keypath="wikiUrl ? 'part.moreInfoWiki' : 'part.moreInfo'"
        tag="p"
        class="part-note"
        scope="global"
      >
        <template #official>
          <a :href="part.officialUrl" target="_blank" rel="noopener">{{ $t('part.official') }}</a>
        </template>
        <template v-if="wikiUrl" #wiki>
          <a :href="wikiUrl" target="_blank" rel="noopener">Mini 4WD Fandom Wiki</a>
        </template>
      </i18n-t>
    </section>

    <!-- A set's own section, above the specs, because what is in the box is the
         whole question a reader opens this page with. -->
    <section v-if="data!.contents.length" class="part-section">
      <h2>{{ $t('part.setContents') }}</h2>
      <p class="part-note">{{ $t('part.setContentsNote') }}</p>
      <dl class="part-table">
        <template v-for="row in data!.contents" :key="row.type">
          <dt>{{ slotTypeLabel(row.type) }}</dt>
          <dd>
            <template v-for="(entry, i) in row.parts" :key="entry?.id ?? i">
              <span v-if="i">{{ $t('build.listSeparator') }}</span>
              <NuxtLink v-if="entry" :to="localePath(`/parts/${entry.id}`)">
                {{ resolve(entry.names).value }}
              </NuxtLink>
              <!-- A piece the set is the only way to buy: naming it would be
                   inventing a product, and linking back to this page would go
                   nowhere. -->
              <span v-else>{{ $t('part.setOwnPiece') }}</span>
            </template>
          </dd>
        </template>
      </dl>
    </section>

    <section v-if="specs.length" class="part-section">
      <h2>{{ $t('part.specs') }}</h2>
      <dl class="part-table">
        <template v-for="spec in specs" :key="spec.key">
          <dt>{{ $t(`spec.${spec.key}`) }}</dt>
          <dd>{{ spec.valueKey ? $t(spec.valueKey) : spec.value }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="buildable" class="part-section">
      <h2>{{ $t('part.compat') }}</h2>
      <!-- Both lists empty means "not chassis-specific" — washers, spacers,
           AO spares — and never "fits nothing"; printing an empty chip row
           for them would say the opposite. An empty include with `other`
           filled is a part for chassis outside v1, and says only that. -->
      <p v-if="fitsAnyChassis(part.chassisCompat)" class="part-note">
        {{ $t('part.compatAll') }}
      </p>
      <ul v-else-if="part.chassisCompat.include.length" class="chip-row">
        <li v-for="entry in data!.chassis" :key="entry.id">
          <NuxtLink class="chip" :to="localePath(`/chassis/${entry.id}`)">
            {{ resolve(entry.names).value }}
          </NuxtLink>
        </li>
      </ul>
      <p v-if="part.chassisCompat.other.length" class="part-note">
        {{ $t(part.chassisCompat.include.length ? 'part.compatOther' : 'part.compatOnlyOther', { list: part.chassisCompat.other.join(', ') }) }}
      </p>

      <h2>{{ $t('part.slots') }}</h2>
      <ul class="chip-row">
        <li v-for="slot in part.slots" :key="slot" class="chip">{{ slotTypeLabel(slot) }}</li>
      </ul>

      <h2>{{ $t('part.classes') }}</h2>
      <dl class="part-table">
        <template v-for="cls in CLASSES" :key="cls">
          <dt>{{ $t(`part.class.${cls}`) }}</dt>
          <dd :class="`legality-${part.classLegality[cls]}`">
            {{ $t(`part.legality.${part.classLegality[cls]}`) }}
          </dd>
        </template>
      </dl>
      <p v-if="part.classLegality.notes" class="part-note">{{ part.classLegality.notes }}</p>
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
          <a :href="part.officialUrl" target="_blank" rel="noopener">{{ $t('part.official') }}</a>
        </li>
        <li v-if="part.hkStoreUrl">
          <a :href="part.hkStoreUrl" target="_blank" rel="noopener">{{ $t('part.hkStore') }}</a>
        </li>
        <li v-if="wikiUrl">
          <a :href="wikiUrl" target="_blank" rel="noopener">
            {{ $t('part.wiki', { title: part.fandomTitle }) }}
          </a>
        </li>
      </ul>
    </section>

    <section v-if="data!.variants.length" class="part-section">
      <h2>{{ $t('part.variants') }}</h2>
      <PartLinkList :parts="data!.variants" :icon="icon" />
    </section>

    <section v-if="data!.related.length" class="part-section">
      <h2 class="part-section-head">
        <span>{{ $t('part.related') }}</span>
        <NuxtLink :to="localePath(`/parts/category/${part.category}`)">
          {{ $t('part.seeAllInCategory', { count: data!.categoryTotal }) }}
        </NuxtLink>
      </h2>
      <PartLinkList :parts="data!.related" :icon="icon" />
    </section>

    <!-- Both credits sit with what they cover rather than in a page footer: the
         wiki line only appears where wiki-derived grouping is on screen. -->
    <p v-if="wikiUrl" class="image-credit">
      {{ $t('part.wikiCredit') }}
      <a :href="FANDOM_WIKI" target="_blank" rel="noopener">{{ $t('build.kitSource.licence') }}</a>
    </p>
    <ImageCredit />
  </article>
</template>
