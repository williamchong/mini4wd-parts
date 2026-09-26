<script setup lang="ts">
/**
 * What the rule engine says about the build, under the list title: the class
 * it is checked against, the findings, and the rules nothing checks yet
 * (docs/PLAN.md §6 M1b).
 *
 * The page resolves each finding's words, because it holds the names, the
 * slots and the chassis they interpolate; the same text is shown on the row
 * the finding is about. This end only lays them out.
 */
import { BUILD_CLASSES } from '#shared/catalog/build'
import type { BuildClass } from '#shared/catalog/build'
import type { Finding } from '#shared/catalog/rules'

const props = defineProps<{
  findings: Array<Finding & { text: string }>
  /** False before a base is chosen: there is nothing to check yet. */
  hasBuild: boolean
  /** The class the findings are checked against, as the reader sees it named. */
  classLabel: string
}>()

const buildClass = defineModel<BuildClass>('buildClass', { required: true })

const emit = defineEmits<{ go: [slotId: string] }>()

const { term } = useTerm()
const { t } = useI18n()

const clean = computed(() => !props.findings.some(f => f.severity !== 'note'))

/** Built once rather than per render: the panel redraws on every slot change. */
const classItems = computed(() =>
  BUILD_CLASSES.map(cls => ({ label: t(`part.class.${cls}`), value: cls })))
</script>

<template>
  <section class="build-findings">
    <!-- One choice among three, from the moment there is a car to check. It
         used to appear only once a fitted part was legal in one class and not
         another, but the page's own three steps promise the choice, and a
         reader building for one class wants the verdict to name it even while
         every answer is the same (owner, 2026-09-26). A radio group rather than
         a row of toggle buttons, because only one class can be in force and
         the grouping says that once instead of each button restating it
         through `aria-pressed`. -->
    <URadioGroup
      v-if="hasBuild"
      v-model="buildClass"
      orientation="horizontal"
      :legend="$t('build.rules.class')"
      :items="classItems"
      class="findings-class"
    />

    <template v-if="hasBuild">
      <p v-if="clean" class="findings-ok">
        {{ $t('build.rules.ok', { class: classLabel }) }}
      </p>
      <ul v-if="findings.length" class="findings-list" aria-live="polite">
        <li v-for="(finding, i) in findings" :key="i" :class="`finding-${finding.severity}`">
          <UBadge :color="severityColor(finding.severity)" variant="subtle" size="sm">
            {{ $t(`build.rules.severity.${finding.severity}`) }}
          </UBadge>
          <UButton v-if="finding.slotId" variant="link" color="neutral" size="xs" @click="emit('go', finding.slotId)">
            {{ finding.text }}
          </UButton>
          <span v-else>{{ finding.text }}</span>
        </li>
      </ul>
    </template>

    <details class="findings-unchecked">
      <summary>{{ $t('build.rules.notChecked.summary') }}</summary>
      <ul>
        <li>{{ $t('build.rules.notChecked.size') }}</li>
        <li>{{ $t('build.rules.notChecked.weight', { motor: term('motor') }) }}</li>
        <li>{{ $t('build.rules.notChecked.modification') }}</li>
      </ul>
      <p>{{ $t('build.rules.notChecked.organiser') }}</p>
    </details>
  </section>
</template>
