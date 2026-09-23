<script setup lang="ts">
/**
 * Parts named in a guide, as `:part-links{ids="15476 15450"}`: each row links
 * to the part's own page and carries the button that puts it on the car, so a
 * reader who has just read why a part helps can try it without a detour. The
 * names and pictures come from the catalog, as in `KitLinks`.
 */
import { goesOnCar } from '#shared/catalog/build'

const props = defineProps<{ ids: string }>()

const { addToBuild } = useAddToBuild()

const itemIds = computed(() => props.ids.split(/\s+/).filter(Boolean))

const { data: parts } = await useAsyncData(() => `part-links-${itemIds.value.join('-')}`, async () => {
  const docs = await queryCollection('parts')
    .select('id', 'stem', 'names', 'thumbnail', 'category', 'slots', 'isCarPart', 'contents')
    .where('stem', 'IN', itemIds.value.map(id => `parts/${id}`))
    .all()
  const byId = new Map(docs.map(doc => [itemId(doc), fromContent('parts')(doc)]))
  // In the order the prose names them, not the order the query returns them.
  return itemIds.value.flatMap(id => byId.get(id) ?? [])
})

/** The fallback glyph for a row with no photo, as on a category page. */
const icon = computed(() => commonestSlot(parts.value ?? []))
</script>

<template>
  <PartLinkList v-if="parts?.length" :parts="parts" :icon="icon">
    <template #action="{ entry }">
      <UButton
        v-if="goesOnCar(entry)"
        v-bind="emphasis(false)"
        size="sm"
        block
        @click="addToBuild(entry)"
      >
        {{ entry.contents ? $t('part.addSetToBuild') : $t('part.addToBuild') }}
      </UButton>
    </template>
  </PartLinkList>
</template>
