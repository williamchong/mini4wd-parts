<script setup lang="ts">
/**
 * The eight chassis, as cards. Small enough that the index is the whole story:
 * a picture, a name and the one line that tells them apart — where the motor
 * sits, what it is geared at, when it arrived (docs/PLAN.md §6 M1b).
 */
import { byChassisOrder } from '#shared/catalog/chassis'

definePageMeta({ layout: 'content' })

const { t } = useI18n()
const { resolve } = useCatalogName()
const localePath = useLocalePath()

const { data } = await useAsyncData('chassis-index', async () => {
  const docs = await queryCollection('chassis')
    .select('id', 'stem', 'names', 'thumbnail', 'motorPosition', 'kitGearRatio', 'releaseYear')
    .all()
  return docs.map(fromContent('chassis')).sort(byChassisOrder)
})

// The same guard its siblings carry. `data!` in a template is a type assertion
// and nothing more: without this, a fetch that came back empty on a client
// navigation would iterate null rather than render the error page.
if (!data.value?.length) {
  throw createError({ statusCode: 404, statusMessage: t('chassis.notFound'), fatal: true })
}

const count = computed(() => ({ count: data.value?.length ?? 0 }))

const title = computed(() => `${t('chassis.title')} — ${t('site.title')}`)
const description = computed(() => t('chassis.description', count.value))

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
    <Breadcrumbs :trail="[{ label: $t('chassis.title') }]" />

    <h1>{{ $t('chassis.title') }}</h1>
    <p class="browse-intro">{{ $t('chassis.intro', count) }}</p>

    <ul class="part-link-list">
      <li v-for="entry in data!" :key="entry.id">
        <NuxtLink :to="localePath(`/chassis/${entry.id}`)">
          <CatalogThumb :src="entry.thumbnail" icon="chassis" />
          <span class="part-link-name">{{ resolve(entry.names).value }}</span>
          <span class="part-id">
            {{ $t(`build.motorPosition.${entry.motorPosition}`) }}
            <template v-if="entry.kitGearRatio"> · {{ entry.kitGearRatio }}</template>
            · {{ entry.releaseYear }}
          </span>
        </NuxtLink>
      </li>
    </ul>

    <p class="image-credit">{{ $t('build.imageCredit') }}</p>
  </div>
</template>
