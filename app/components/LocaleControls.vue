<script setup lang="ts">
/**
 * The language menu. One control, one question — Hong Kong and Taiwan wording
 * used to sit beside it as a second, unrelated toggle, and with only Hong Kong
 * wording offered (app/composables/useWording.ts) there is nothing left to
 * merge into the menu but the locales themselves.
 */
const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const current = computed(() => locales.value.find(l => l.code === locale.value))

/**
 * Without the hash `switchLocalePath` copies from the router's route. A hash
 * never means the same thing in the other locale: a heading anchor is a slug
 * of translated text, and the builder writes its link with `replaceState`,
 * which the router never sees, so the copied hash is the build as it was when
 * the page was opened, and switching would undo every change since
 * (app/composables/useBuildLink.ts puts the current build back).
 */
const localeHref = (code: Parameters<typeof switchLocalePath>[0]) => switchLocalePath(code).split('#')[0]

const menu = useTemplateRef<HTMLDetailsElement>('menu')

const close = () => { if (menu.value) menu.value.open = false }

/**
 * A disclosure does not close itself the way a `<select>` does, and one left
 * hanging over the page is worse than no menu at all. Both listeners are
 * client-only by virtue of `onMounted`, which is also the only place `document`
 * exists on a prerendered route.
 */
onMounted(() => {
  const onPointerDown = (event: PointerEvent) => {
    if (menu.value?.open && !event.composedPath().includes(menu.value)) close()
  }
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menu.value?.open) close()
  }
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeydown)
  })
})
</script>

<template>
  <!--
    `<details>` rather than a button and a `v-if`, for two reasons. The panel's
    links are in the prerendered HTML either way — hidden, but present — which
    is what lets the crawler reach the English tree and a reader switch before
    the page has hydrated. And open/close, keyboard included, is the element's
    job rather than ours.
  -->
  <details ref="menu" class="locale-menu">
    <summary :aria-label="$t('locale.label')">
      <span aria-hidden="true">🌐</span>
      <span>{{ current?.name }}</span>
    </summary>

    <ul class="locale-menu-list">
      <!--
        Every locale, the current one included and marked, so the menu says
        what is selected rather than only what else there is. Each carries its
        own `lang`, because a name is written in the language it names.
      -->
      <li v-for="l in locales" :key="l.code">
        <!--
          `aria-current` is set rather than left to NuxtLink, which would reach
          the same `page` on the entry that links to the route already shown.
          Setting it means the tick cannot quietly vanish on a route where that
          match does not hold, and setting it to the same value NuxtLink uses
          means the two can never disagree about which one won.
        -->
        <NuxtLink
          :to="localeHref(l.code)"
          :lang="l.language"
          :aria-current="l.code === locale ? 'page' : undefined"
          @click="close"
        >{{ l.name }}</NuxtLink>
      </li>
    </ul>
  </details>
</template>
