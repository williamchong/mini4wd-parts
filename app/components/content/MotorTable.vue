<script setup lang="ts">
/**
 * Motors compared in a guide, as `:motor-table{ids="15484 15486"}`: one row a
 * motor, in the order the prose gives, with the speed, torque and class
 * verdicts its catalog record holds. The numbers are the ones its part page
 * prints, read through the same `specRowsFor`, so a guide never restates them
 * and cannot drift from them.
 *
 * A plain `<table>`: `UTable` brings a table engine for sorting and selection,
 * and these are six to nine fixed rows.
 */
import { BUILD_CLASSES } from '#shared/catalog/build'
import type { Part } from '#shared/catalog/schema'

const props = defineProps<{ ids: string }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { resolve, isFallback } = useCatalogName()

const itemIds = computed(() => props.ids.split(/\s+/).filter(Boolean))

const { data: motors } = await useAsyncData(() => `motor-table-${itemIds.value.join('-')}`, async () => {
  const docs = await queryCollection('parts')
    .select('id', 'stem', 'names', 'specs', 'classLegality')
    .where('stem', 'IN', itemIds.value.map(id => `parts/${id}`))
    .all()
  const byId = new Map(docs.map(doc => [itemId(doc), fromContent('parts')(doc)]))
  // In the order the prose names them, not the order the query returns them.
  return itemIds.value.flatMap(id => byId.get(id) ?? [])
})

/**
 * The shortest true phrase for where a motor may race, because this column is
 * the one that wraps on a phone: all, none, all but one, and only then a list.
 */
function classesLabel(classLegality: Part['classLegality']) {
  const legal = BUILD_CLASSES.filter(cls => classLegality[cls] === 'legal')
  const out = BUILD_CLASSES.filter(cls => !legal.includes(cls))
  if (!out.length) return t('part.motorTable.allClasses')
  if (!legal.length) return undefined
  if (out.length === 1) return t('part.motorTable.allBut', { cls: t(`part.class.${out[0]}`) })
  return legal.map(cls => t(`part.class.${cls}`)).join(t('part.motorTable.separator'))
}

const rows = computed(() => (motors.value ?? []).map((motor) => {
  const specs = new Map(specRowsFor(motor, 'motor').map(row => [row.key, row.value]))
  return {
    motor,
    rpm: specs.get('motorRpm'),
    torque: specs.get('motorTorque'),
    /** Undefined for a motor no class takes, which the cell words and mutes. */
    classes: classesLabel(motor.classLegality)
  }
}))
</script>

<template>
  <div v-if="rows.length" class="motor-table">
    <table>
      <thead>
        <tr>
          <th scope="col">{{ $t('part.motorTable.motor') }}</th>
          <th scope="col">{{ $t('spec.motorRpm') }}</th>
          <th scope="col">{{ $t('spec.motorTorque') }}</th>
          <th scope="col">{{ $t('part.classes') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.motor.id">
          <th scope="row">
            <!-- The class goes on a span: a bare anchor is what takes the prose link colour. -->
            <NuxtLink :to="localePath(`/parts/${row.motor.id}`)">
              <span :class="{ fallback: isFallback(row.motor.names) }">{{ resolve(row.motor.names).value }}</span>
            </NuxtLink>
          </th>
          <td class="motor-table-num">{{ row.rpm ?? '—' }}</td>
          <td class="motor-table-num">{{ row.torque ?? '—' }}</td>
          <td :class="{ 'motor-table-out': !row.classes }">{{ row.classes ?? $t('part.motorTable.noClass') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
