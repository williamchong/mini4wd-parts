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
  /** Some part in the build is legal in one class and not another. */
  classDecides: boolean
  /** The class the findings name, or a word for any race while the class decides nothing. */
  classLabel: string
}>()

const buildClass = defineModel<BuildClass>('buildClass', { required: true })

const emit = defineEmits<{ go: [slotId: string] }>()

const { term } = useTerm()

const clean = computed(() => !props.findings.some(f => f.severity !== 'note'))
</script>

<template>
  <section class="build-findings">
    <!-- Only while the class can change a finding: a toggle whose every
         position gives the same answer asks the reader a question for nothing. -->
    <div v-if="classDecides" class="findings-class">
      <span>{{ $t('build.rules.class') }}</span>
      <!-- Toggle buttons with aria-pressed, the same treatment as the base
           picker's two doors, for the same reason. -->
      <div class="door-toggle">
        <button
          v-for="cls in BUILD_CLASSES"
          :key="cls"
          type="button"
          :aria-pressed="buildClass === cls"
          :class="{ active: buildClass === cls }"
          @click="buildClass = cls"
        >
          {{ $t(`part.class.${cls}`) }}
        </button>
      </div>
    </div>

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
