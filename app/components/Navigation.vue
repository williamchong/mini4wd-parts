<script setup lang="ts">
/**
 * The site header: the mark, the sections, the language menu.
 *
 * The links are a list rather than five hand-written tags because one of them
 * is not a link. `/guides` is still the "coming soon" stub it was scaffolded
 * as, one `index.md` per locale under content/, and a nav that leads a beginner
 * to an empty page spends the one click they were willing to give it. It stays
 * in the bar, disabled, so the plan stays visible without being a dead end —
 * and it stays prerendered and in the sitemap, because the route has been
 * shared and GitHub Pages cannot redirect one away (docs/PLAN.md §4.6).
 */
const sections: { to: string, key: string, disabled?: boolean }[] = [
  // The builder is the home page, so this is the mark's destination too. Named
  // for what it does: "Home" describes where it sits, not what a reader gets.
  { to: '/', key: 'builder' },
  { to: '/guides', key: 'guides', disabled: true },
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
        <!-- `aria-disabled` and not `disabled`: this is a link, and a link has
             no disabled state to set. Dropping the href is what actually takes
             it out of the tab order and off the pointer.

             `title` reaches a mouse and nothing else, so the same words are in
             the text too, hidden: dimmed-and-not-a-link is only legible if you
             can see it. -->
        <span
          v-if="section.disabled"
          class="nav-link is-disabled"
          aria-disabled="true"
          :title="$t('nav.comingSoon')"
        >{{ $t(`nav.${section.key}`) }}<span class="visually-hidden"> {{ $t('nav.comingSoon') }}</span></span>
        <NuxtLink v-else class="nav-link" :to="localePath(section.to)">
          {{ $t(`nav.${section.key}`) }}
        </NuxtLink>
      </li>
    </ul>

    <LocaleControls />
  </nav>
</template>
