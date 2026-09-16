<script setup lang="ts">
/**
 * The drawn stand-in for a slot's contents. What each glyph is and why we draw
 * our own is in app/utils/icons.ts, which holds the paths.
 */
import type { IconName } from '~/utils/icons'

const props = defineProps<{ name: IconName }>()

const paths = computed(() => glyphFor(props.name))
</script>

<template>
  <!-- Always beside the name of the thing it draws, so it is decoration. -->
  <svg
    class="slot-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
