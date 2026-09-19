<script setup lang="ts">
/**
 * Kits named in a guide, as `:kit-links{ids="18647 18706"}`: each row opens
 * the builder on that kit, as a chassis page's kit rows do. The names,
 * pictures and chassis come from the catalog, so the prose never restates a
 * fact the catalog already holds.
 */
const props = defineProps<{ ids: string }>()

const kitBuildLink = useKitBuildLink()

const itemIds = computed(() => props.ids.split(/\s+/).filter(Boolean))

const { data: kits } = await useAsyncData(() => `kit-links-${itemIds.value.join('-')}`, async () => {
  const docs = await queryCollection('kits')
    .select('id', 'stem', 'names', 'thumbnail', 'chassis')
    .where('stem', 'IN', itemIds.value.map(id => `kits/${id}`))
    .all()
  const byId = new Map(docs.map(doc => [itemId(doc), fromContent('kits')(doc)]))
  // In the order the prose names them, not the order the query returns them.
  return itemIds.value.flatMap(id => byId.get(id) ?? [])
})
</script>

<template>
  <PartLinkList
    v-if="kits?.length"
    :parts="kits"
    icon="body"
    :to="kit => kitBuildLink(kit.chassis, kit.id)"
  />
</template>
