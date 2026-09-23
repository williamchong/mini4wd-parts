<script setup lang="ts">
/**
 * What the reader sees while the page's JavaScript has not arrived — and what
 * they see if it never does. Every page is prerendered, so a 503 on an
 * `/_nuxt/` chunk leaves a page that looks finished and does nothing: the
 * builder's rows and buttons are all inert until hydration. This says so.
 *
 * It is server-rendered and gone on mount, so a reader whose scripts load in
 * time never sees it: the CSS holds it invisible for its first 1.5 s. The one
 * thing that cannot wait for Vue is noticing that Vue is not coming, so an
 * inline script in the head listens for a `/_nuxt/` script or modulepreload
 * that fails to load and marks `<html>`, which switches the notice from 載入中
 * to the failure and its reload button — a plain `onclick`, since nothing else
 * will ever run. Reloading keeps the build, which lives in the `#hash`
 * (useBuildLink.ts).
 *
 * The script is added on the server only: by the time the client could add it
 * the server's copy has run, and registering it there would put the string in
 * every route's entry chunk. The listener outlives hydration and a later chunk
 * failure still marks `<html>`, which is harmless: by then the element it
 * styles is gone.
 */
const mounted = ref(false)
onMounted(() => { mounted.value = true })

// Nothing but the app's own scripts and modulepreloads comes from /_nuxt/ —
// images are under /thumbs/ and /images/, and a stylesheet failing does not
// stop hydration, so its `href` is not read.
const BOOT_SCRIPT = `(function(d){addEventListener('error',function(e){e=e.target;`
  + `if(/\\/_nuxt\\//.test(e.src||e.rel=='modulepreload'&&e.href))d.setAttribute('data-boot-failed','')},!0)})(document.documentElement)`

if (import.meta.server) {
  useHead({ script: [{ innerHTML: BOOT_SCRIPT, tagPriority: 'critical' }] })
}
</script>

<template>
  <div v-if="!mounted" class="boot-notice" role="status">
    <span class="boot-notice-loading">{{ $t('loading.pending') }}</span>
    <span class="boot-notice-failed">
      {{ $t('loading.pageFailed') }}
      <button type="button" onclick="location.reload()">{{ $t('loading.reload') }}</button>
    </span>
  </div>
</template>
