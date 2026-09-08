<script setup lang="ts">
/**
 * Where this build's parts list came from.
 *
 * This is the first surface on the site that renders Fandom-sourced content, so
 * it is the first that has to attribute it. The wiki is CC-BY-SA and the licence
 * wants the work named and its URI given on the page that uses it, not only on a
 * site-wide attribution page (CLAUDE.md, docs/PLAN.md §4.7). Written as its own
 * component so it lifts unchanged into /kits/:id when that page lands.
 */
import { fandomArticleUrl } from '#shared/catalog/kits'
import type { PickableKit } from '#shared/catalog/build'

const props = defineProps<{ kit: PickableKit }>()

/**
 * Branch on `loadoutSource`, not on whether a title happens to be present. The
 * two agree across all 305 committed kits, but the schema marks the title
 * optional regardless of source, so reading the correlation would turn a data
 * gap into a missing credit rather than into a visible bug.
 */
const article = computed(() =>
  props.kit.loadoutSource === 'fandom' && props.kit.loadoutSourceTitle
    ? { title: props.kit.loadoutSourceTitle, url: fandomArticleUrl(props.kit.loadoutSourceTitle) }
    : undefined)
</script>

<template>
  <!-- Every outbound link here opens in a new tab, and that is protection
       rather than convention: the build lives in memory with no persistence and
       no URL encoding yet, so a same-tab navigation destroys it. -->
  <p v-if="article" class="kit-credit">
    {{ $t('build.kitSource.fandom') }}
    <a :href="article.url" target="_blank" rel="noopener">{{ article.title }}</a>
    <!-- An explicit space, not a margin: Vue condenses the whitespace between
         two elements away, and a credit has to still read as a sentence when
         the stylesheet does not load. -->
    <!-- The licence is deliberately unversioned, and this is not an omission to
         tidy up later: the wiki's own api.php `rightsinfo` reports exactly
         `{"url": "https://www.fandom.com/licensing", "text": "CC-BY-SA"}`
         (checked 2026-09-09), so this names the licence and the URI the source
         itself declares. Do not "fix" it to 3.0 or 4.0 by guessing. -->
    {{ ' ' }}
    <a
      class="kit-licence"
      href="https://www.fandom.com/licensing"
      target="_blank"
      rel="license noopener"
    >{{ $t('build.kitSource.licence') }}</a>
  </p>

  <!-- The 13 kits with no wiki row. The three-state origin badge already says
       every slot but the body is the chassis' own default; this says why, which
       a badge cannot. No empty link, no "source unknown". -->
  <p v-else class="kit-credit kit-credit-none">{{ $t('build.kitSource.chassis') }}</p>
</template>
