<script setup lang="ts">
/**
 * Stands in for a picker whose chunk has not arrived, or will not
 * (app/utils/lazyPicker.ts). `close` does what closing the picker would.
 *
 * Plain markup rather than `UModal`, which is in the very chunks this waits
 * on: importing it here would put Reka's dialog on the builder's first load,
 * and a trap that pulls focus in would leave the picker, when it does arrive,
 * recording this card as the place to hand focus back to. So it takes no
 * focus, traps none, and returns it itself when closed before the picker
 * ever mounts.
 */
import { onKeyStroke } from '@vueuse/core'

defineProps<{ error?: Error }>()
const emit = defineEmits<{ close: [] }>()

useReturnFocus()

onKeyStroke('Escape', () => emit('close'))

function reload() {
  location.reload()
}
</script>

<template>
  <div class="picker-pending" @click.self="emit('close')">
    <div class="picker-pending-card" role="status">
      <p>{{ $t(error ? 'loading.pickerFailed' : 'loading.pending') }}</p>
      <div class="picker-pending-actions">
        <UButton v-if="error" :label="$t('loading.reload')" @click="reload" />
        <UButton :label="$t('build.close')" color="neutral" variant="outline" @click="emit('close')" />
      </div>
    </div>
  </div>
</template>
