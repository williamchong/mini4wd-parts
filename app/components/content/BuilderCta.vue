<script setup lang="ts">
/**
 * The way from a guide into the builder, as `::builder-cta` with the button's
 * words as its body. A component rather than a Markdown link, because a link
 * in a guide is written once per locale by hand and this one has to follow
 * the reader's locale to `/` or `/en/`.
 */
const localePath = useLocalePath()
</script>

<template>
  <p class="builder-cta">
    <UButton size="lg" :to="localePath('/')">
      <slot mdc-unwrap="p" />
    </UButton>
  </p>
</template>
