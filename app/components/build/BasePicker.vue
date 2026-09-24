<script setup lang="ts">
/**
 * What the car is built on: a kit, or a bare chassis (docs/PLAN.md §4.7). A
 * dialog opened from the top row of the build list, so the list and the 3D
 * pane stay on screen whether or not anything has been chosen yet.
 *
 * Choosing again starts a fresh build: swaps are a delta over one kit's stock
 * loadout and do not carry over to another's.
 */
import type { PickableKit } from '#shared/catalog/build'
import type { Chassis, ChassisId } from '#shared/catalog/schema'

type ChassisCard = Pick<Chassis,
  'id' | 'names' | 'motorShaft' | 'motorPosition' | 'releaseYear' | 'notes'>

defineProps<{
  kits: PickableKit[]
  chassis: ChassisCard[]
  /** Open on the kit door already narrowed to this chassis. */
  kitChassis?: ChassisId | null
}>()

const emit = defineEmits<{ select: [chassis: ChassisId, kit?: string]; close: [] }>()

// The parent unmounts this on `close`, so the dialog restores focus itself.
useReturnFocus()

/** Kit first, because most beginners arrive holding a box. */
const door = ref<'kit' | 'chassis'>('kit')

const { t } = useI18n()

/** Built once: an inline array hands UTabs a new identity on every render. */
const doors = computed(() => [
  { label: t('build.door.kit'), value: 'kit' },
  { label: t('build.door.chassis'), value: 'chassis' }
])
</script>

<template>
  <UModal
    open
    :title="$t('build.pickBase')"
    :ui="{ content: 'max-w-5xl max-h-[85vh]', body: 'overflow-y-auto' }"
    @update:open="value => { if (!value) emit('close') }"
  >
    <!-- The two doors are the header: which one is open is the first thing
         asked, and putting them beside the title would make it a subtitle of
         a question it is really the answer to. -->
    <template #header>
      <!--
        A real tablist at last. These two were `aria-pressed` toggle buttons
        with a comment saying they were deliberately not tabs, because the tab
        pattern promises roving tabindex and arrow-key selection and two plain
        buttons implement neither. `UTabs` implements both, so the promise can
        be made. `:content="false"` because the panels are the body below —
        which door is open decides what the dialog is showing, not what sits
        under a strip inside it.
      -->
      <UTabs
        v-model="door"
        :content="false"
        :items="doors"
      />
    </template>

    <template #body>
      <!-- The whole record, not an id: the chassis and the kit are read off
           one object, so a build whose chassis and kit disagree is
           unrepresentable through the UI. -->
      <BuildKitPicker
        v-if="door === 'kit'"
        :kits="kits"
        :chassis="chassis"
        :initial-chassis="kitChassis ?? null"
        @select="(k: PickableKit) => emit('select', k.chassis, k.id)"
      />
      <BuildChassisPicker
        v-else
        :chassis="chassis"
        @select="(id: ChassisId) => emit('select', id)"
      />
    </template>
  </UModal>
</template>
