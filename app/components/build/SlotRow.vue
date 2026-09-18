<script setup lang="ts">
/**
 * One slot of the build. What is in it comes from `resolveBuild`, so this
 * component barely has to know whether the contents came from the chassis, the
 * kit or the user — mostly only whether the user changed it, which is what
 * Revert undoes. `stockThumb` is the one exception, and it reads `origin` for
 * the reason given there.
 */
import { thumbnailSrc } from '#shared/catalog/thumbnails'
import type { BuildablePart, ResolvedSlot } from '#shared/catalog/build'
import type { Finding } from '#shared/catalog/rules'

const props = defineProps<{
  slot: ResolvedSlot
  partsById: Map<string, BuildablePart>
  /** False while there is no build to change yet. */
  swappable: boolean
  /**
   * A photo for an entry that came in the box and is not a catalog part, where
   * the page has one to offer. The body slot is the case that exists: what a
   * kit puts in it is the moulded shell, which has no product photo of its own
   * because Tamiya never sold it — but the box art is a picture of that shell.
   *
   * Which slots get one is `stockThumbFor` in pages/index.vue; this end only
   * decides which *entry* within a slot may wear it.
   */
  stockThumb?: string
  /** The front/rear counterpart this row can copy, when copying would change it. */
  copyFrom?: ResolvedSlot
  /** What the rule engine says about this row, words already resolved. */
  findings?: Array<Finding & { text: string }>
  /** Rollers each side where the stay carries more than one (`rollersPerSideIn`). */
  rollersPerSide?: number
}>()

const emit = defineEmits<{ open: []; revert: []; copy: [] }>()

const { label: resolveLabel } = useCatalogName()
const { slotLabel } = useTerm()
const localePath = useLocalePath()

// Regional wording applies to slot names too, so 摩打 / 馬達 follows the
// toggle rather than being frozen into the message file.
const label = computed(() => slotLabel(props.slot))

const copyLabel = computed(() =>
  props.copyFrom ? slotLabel(props.copyFrom) : '')

/**
 * What to print for each entry, and whether to mark it.
 *
 * One pass rather than a text function and a fallback function: both need the
 * same `partsById` lookup and the same locale walk, and split across two
 * template calls the row would do each twice while the two could drift apart.
 *
 * A label can resolve to nothing — a wiki phrase we have not translated carries
 * only `en`, which an English reader gets and a Chinese one does not. The slot
 * name is the honest stand-in there: the slot really is filled, we just cannot
 * say with what in this language. A part always resolves, because `ja` is
 * required on a catalog record.
 */
const rows = computed(() => props.slot.entries.map((entry) => {
  const part = entry.partId ? props.partsById.get(entry.partId) : undefined
  const names = part?.names ?? entry.label
  const hit = names && resolveLabel(names)
  return {
    text: hit?.value ?? (entry.label ? label.value : entry.partId ?? ''),
    fallback: hit?.fallback ?? false,
    // Only a catalog part has a page. The moulded-in-the-box entries are the
    // majority and link nowhere, which is why this is a row of text with some
    // links in it rather than a row of links.
    partId: entry.partId,
    // A catalog part's own photo first: a swapped-in part is not what the box
    // art shows, however well the box art shows the slot. `stockThumb` covers
    // the entry that is still the one that came in the box, and everything
    // else falls through to the slot's glyph.
    thumbnail: thumbnailSrc('parts', part)
      ?? (entry.origin === 'kit' ? props.stockThumb : undefined)
  }
}))
</script>

<template>
  <!-- Addressable so a part added from its own page can scroll its row into
       view (`place` in pages/index.vue). -->
  <li :id="`slot-${slot.id}`" class="slot-row" :class="{ swapped: slot.swapped }">
    <div class="slot-label">{{ label }}</div>

    <div class="slot-entries">
      <p v-if="!slot.entries.length" class="slot-empty">
        <CatalogThumb class="entry-thumb" :icon="slot.type" />
        <span>{{ $t('build.empty') }}</span>
      </p>
      <p
        v-for="(row, i) in rows"
        :key="i"
        class="slot-entry"
        :class="{ fallback: row.fallback }"
      >
        <CatalogThumb class="entry-thumb" :src="row.thumbnail" :icon="slot.type" />
        <NuxtLink v-if="row.partId" :to="localePath(`/parts/${row.partId}`)">{{ row.text }}</NuxtLink>
        <span v-else>{{ row.text }}</span>
      </p>
      <p v-if="rollersPerSide" class="slot-note">
        {{ $t('build.rollersPerSide', { n: rollersPerSide }) }}
      </p>
      <!-- Severity in words as well as colour, so the marker survives a
           colour-blind reader and a screen reader alike. -->
      <p
        v-for="(finding, i) in findings"
        :key="`finding-${i}`"
        class="slot-finding"
        :class="`finding-${finding.severity}`"
      >
        <span class="finding-severity">{{ $t(`build.rules.severity.${finding.severity}`) }}</span>
        <span>{{ finding.text }}</span>
      </p>
    </div>

    <div v-if="swappable" class="slot-actions">
      <button type="button" @click="emit('open')">
        {{ $t('build.swap') }}
      </button>
      <button v-if="copyFrom" type="button" class="link" @click="emit('copy')">
        {{ $t('build.copyFrom', { slot: copyLabel }) }}
      </button>
      <button v-if="slot.swapped" type="button" class="link" @click="emit('revert')">
        {{ $t('build.revert') }}
      </button>
    </div>
  </li>
</template>
