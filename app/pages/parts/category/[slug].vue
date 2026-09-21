<script setup lang="ts">
/**
 * One category, listed. The middle level of the parts hierarchy: `/parts`
 * above, `/parts/<item number>` below (docs/PLAN.md §6 M1b).
 *
 * `category/` is in the path because it has to be. `/parts/roller` and
 * `/parts/15512` are both `/parts/:param`, so a bare category slug would be a
 * route conflict with the part page rather than a prettier URL.
 *
 * The chassis filter lives in the **hash**. As `?chassis=ma` it would be a
 * crawlable near-duplicate of this page, and a static site has no response
 * header to keep it out of the index; as component state alone it would not
 * survive a reload or a paste. A hash is neither indexed nor lost.
 */
import { byChassisOrder, isChassisId } from '#shared/catalog/chassis'
import type { ChassisId } from '#shared/catalog/chassis'
import type { PartCategory } from '#shared/catalog/schema'

definePageMeta({ layout: 'content' })

const route = useRoute()
const { t } = useI18n()
const { term, categoryIntro } = useTerm()
const { resolve } = useCatalogName()
const localePath = useLocalePath()

const slug = computed(() => String(route.params.slug))

const { data } = await useAsyncData(() => `category-${slug.value}`, async () => {
  const [docs, chassis] = await Promise.all([
    queryCollection('parts')
      .select('id', 'stem', 'names', 'thumbnail', 'slots', 'chassisCompat')
      .where('category', '=', slug.value)
      .all(),
    queryCollection('chassis').select('id', 'stem', 'names').all()
  ])
  if (!docs.length) return null

  const parts = docs.map(fromContent('parts')).map(({ slots: _slots, chassisCompat, ...stub }) => ({
    ...stub,
    // Only the include list reaches the wire: `other` names chassis outside v1
    // scope, which no chip here can select, and `source` is provenance for the
    // part's own page.
    chassis: chassisCompat.include
  }))

  return {
    parts: parts.sort((a, b) => a.id.localeCompare(b.id)),
    icon: commonestSlot(docs),
    chassis: chassis.map(fromContent('chassis'))
      .sort(byChassisOrder)
      .map(entry => ({ id: entry.id, names: entry.names }))
  }
})

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: t('browse.category.notFound'), fatal: true })
}

const category = computed(() => slug.value as PartCategory)
const label = computed(() => term(category.value, `part.category.${category.value}`))
const intro = computed(() => categoryIntro(category.value))

/** Tamiya Hong Kong's own guide to what each part type does, in Traditional Chinese. */
const SETTING_GUIDE = 'https://tamiya.hk/mini-4wd-machine-setting-guide/'

/**
 * Empty until mounted, which is also what the prerendered HTML must show: the
 * unfiltered page is the one at this URL, and the filter is something the
 * reader did afterwards.
 */
const selected = ref<ChassisId | ''>('')

const chassisIn = (hash: string): ChassisId | '' => {
  const id = hash.replace(/^#/, '')
  return isChassisId(id) ? id : ''
}

onMounted(() => {
  // `route.hash` watched, never `location.hash` read once: a prerendered page
  // opened at `/…#ma` hydrates with the hash stripped and has it restored on
  // `app:suspense:resolve`, after this hook. The same lesson `useBuildLink`
  // is built around, one route over.
  watch(() => route.hash, (hash) => { selected.value = chassisIn(hash) }, { immediate: true })
})

/**
 * An empty include list is a part that is not chassis-specific — washers,
 * spacers, AO spares — so it fits whatever is selected. It never means "fits
 * nothing", which is the one misreading the schema comment exists to prevent.
 */
const fits = (include: ChassisId[], chassis: ChassisId) =>
  !include.length || include.includes(chassis)

function select(id: ChassisId | '') {
  selected.value = id
  // `replaceState`, so the back button still means "leave this page" rather
  // than becoming an undo stack for chip taps.
  history.replaceState(history.state, '', `${location.pathname}${location.search}${id ? `#${id}` : ''}`)
}

/**
 * Every chassis with its count, the way the kit picker's row reads — a chip
 * saying 0 is more use than a missing chip, because it answers the question
 * rather than leaving the reader to wonder whether they missed it.
 */
const chips = computed(() => (data.value?.chassis ?? []).map(entry => ({
  id: entry.id,
  name: resolve(entry.names).value,
  count: (data.value?.parts ?? []).filter(part => fits(part.chassis, entry.id)).length
})))

const shown = computed(() => {
  const chassis = selected.value
  if (!chassis) return data.value?.parts ?? []
  return (data.value?.parts ?? []).filter(part => fits(part.chassis, chassis))
})

const counts = computed(() => ({ category: label.value, count: data.value?.parts.length ?? 0 }))

const title = computed(() => `${label.value} — ${t('site.title')}`)
const description = computed(() => t('browse.category.description', counts.value))

useHead(() => ({
  title: title.value,
  meta: [
    { name: 'description', content: description.value },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: description.value }
  ]
}))
</script>

<template>
  <div>
    <Breadcrumbs
      :trail="[{ to: '/parts', label: $t('nav.parts') }, { label }]"
    />

    <h1>{{ label }}</h1>
    <template v-if="intro">
      <p class="browse-intro">{{ intro }}</p>
      <i18n-t keypath="browse.category.moreInfo" tag="p" class="part-note" scope="global">
        <template #guide>
          <a :href="SETTING_GUIDE" target="_blank" rel="noopener">{{ $t('browse.category.guide') }}</a>
        </template>
      </i18n-t>
    </template>
    <p class="browse-intro">{{ $t('browse.category.count', { count: data!.parts.length }) }}</p>

    <h2 class="browse-filter-label">{{ $t('browse.category.filter') }}</h2>
    <!-- The kit picker's chip row, reused: same control, same job, and the
         reader has already met it in the builder. -->
    <ul class="chassis-chips">
      <li>
        <UButton
          size="xs"
          :color="!selected ? 'primary' : 'neutral'"
          :variant="!selected ? 'solid' : 'outline'"
          :aria-pressed="!selected"
          @click="select('')"
        >
          {{ $t('build.chassisAll') }}
          <span class="chip-count">{{ data!.parts.length }}</span>
        </UButton>
      </li>
      <li v-for="chip in chips" :key="chip.id">
        <UButton
          size="xs"
          :color="selected === chip.id ? 'primary' : 'neutral'"
          :variant="selected === chip.id ? 'solid' : 'outline'"
          :aria-pressed="selected === chip.id"
          @click="select(chip.id)"
        >
          {{ chip.name }}
          <span class="chip-count">{{ chip.count }}</span>
        </UButton>
      </li>
    </ul>

    <PartLinkList v-if="shown.length" :parts="shown" :icon="data!.icon" />
    <p v-else class="part-note">{{ $t('browse.category.none') }}</p>

    <ImageCredit />
  </div>
</template>
