<script setup lang="ts">
/**
 * A catalog photo where we have one, the slot icon where we do not.
 *
 * The photos are our own 160x120 downscales under public/thumbs, not Tamiya's
 * CDN (docs/PLAN.md §6 M1b), so there is no third-party host on the critical
 * path — but the fallback stays anyway. It is what makes honouring a takedown a
 * matter of deleting a directory: without the photos every row still reads.
 */
import { THUMB_SIZES } from '#shared/catalog/thumbnails'
import type { ThumbVariant } from '#shared/catalog/thumbnails'
import type { IconName } from '~/utils/icons'

const props = withDefaults(defineProps<{
  src?: string
  icon: IconName
  /**
   * Which of the two generated sizes `src` names. It sets the intrinsic size
   * the browser reserves — attributes that claimed 160x120 for a 320x240 file
   * would misdescribe it the day the two stop sharing a 4:3 box — and a detail
   * copy is by definition the one picture its page leads with, so it also loads
   * eagerly rather than behind everything else on the route.
   */
  variant?: ThumbVariant
}>(), { src: undefined, variant: 'row' })

const size = computed(() => THUMB_SIZES[props.variant])
const eager = computed(() => props.variant === 'detail')

const broken = ref(false)
const image = useTemplateRef<HTMLImageElement>('image')

// A row that scrolls out and back gets a new src; the old failure is not news
// about the new file.
watch(() => props.src, () => { broken.value = false })

/**
 * An image that failed before Vue attached `@error` — one in prerendered
 * markup, hydrated after the browser already gave up on it — fired its event
 * into the void and would sit as a broken box forever.
 */
onMounted(() => {
  if (image.value?.complete && image.value.naturalWidth === 0) broken.value = true
})
</script>

<template>
  <!-- Explicit width and height so lazy loading has a box to reason about and
       lists do not reflow as photos land. The name is always beside it, so the
       image itself is decoration. -->
  <img
    v-if="src && !broken"
    ref="image"
    class="catalog-thumb"
    :src="src"
    alt=""
    :loading="eager ? 'eager' : 'lazy'"
    :fetchpriority="eager ? 'high' : undefined"
    decoding="async"
    :width="size.width"
    :height="size.height"
    @error="broken = true"
  >
  <span v-else class="catalog-thumb is-icon">
    <SlotIcon :name="icon" />
  </span>
</template>
