<script setup lang="ts">
/**
 * The site header: the mark, the sections, the language menu.
 */
const sections: { to: string, key: string }[] = [
  // The builder is the home page, so this is the mark's destination too. Named
  // for what it does: "Home" describes where it sits, not what a reader gets.
  { to: '/', key: 'builder' },
  { to: '/guides', key: 'guides' },
  { to: '/parts', key: 'parts' },
  { to: '/chassis', key: 'chassis' },
  { to: '/about', key: 'about' }
]

const localePath = useLocalePath()
</script>

<template>
  <nav class="nav">
    <!-- `aria-label` rather than the text alone: the name is hidden on a phone
         (main.css) and a link whose only content is a decorative image has no
         accessible name at all. -->
    <NuxtLink :to="localePath('/')" class="nav-brand" :aria-label="$t('site.title')">
      <!-- The favicon, at its display size. `alt` is empty because the site
           name is the text right beside it; announcing both reads the name
           twice. -->
      <img src="/favicon.png" alt="" width="28" height="28">
      <span class="nav-brand-name">{{ $t('site.title') }}</span>
    </NuxtLink>

    <ul class="nav-sections">
      <li v-for="section in sections" :key="section.key">
        <NuxtLink class="nav-link" :to="localePath(section.to)">
          {{ $t(`nav.${section.key}`) }}
        </NuxtLink>
      </li>
    </ul>

    <LocaleControls />
  </nav>
</template>
