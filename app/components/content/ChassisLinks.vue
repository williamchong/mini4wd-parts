<script setup lang="ts">
/**
 * Chassis named in a guide, as `:chassis-links{ids="ma ar fm-a"}`: each row
 * links to the chassis page, which holds the specs, the bare runner's loadout
 * and every kit built on it. The names and pictures come from the catalog, as
 * in `KitLinks`, so the prose never restates what a chassis record holds.
 */
const props = defineProps<{ ids: string }>()

const localePath = useLocalePath()

const chassisIds = computed(() => props.ids.split(/\s+/).filter(Boolean))

const { data: chassis } = await useAsyncData(() => `chassis-links-${chassisIds.value.join('-')}`, async () => {
  const docs = await queryCollection('chassis')
    .select('id', 'stem', 'names', 'thumbnail')
    .where('stem', 'IN', chassisIds.value.map(id => `chassis/${id}`))
    .all()
  const byId = new Map(docs.map(doc => [itemId(doc), fromContent('chassis')(doc)]))
  // In the order the prose names them, not the order the query returns them.
  return chassisIds.value.flatMap(id => byId.get(id) ?? [])
})
</script>

<template>
  <PartLinkList
    v-if="chassis?.length"
    :parts="chassis"
    icon="chassis"
    :to="entry => localePath(`/chassis/${entry.id}`)"
  />
</template>
