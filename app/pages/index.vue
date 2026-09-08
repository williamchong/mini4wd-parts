<template>
  <div class="wip-container">
    <div class="wip-content">
      <div class="logo-container">
        <model-viewer
          id="carModel"
          class="logo"
          :alt="$t('landing.modelAlt')"
          src="/images/4wd.glb"
          poster="/images/4wd.png"
          ar
          exposure="0.55"
          interaction-prompt="none"
          auto-rotate
          auto-rotate-delay="2000"
          rotation-per-second="10deg"
          disable-zoom
          disable-pan
          camera-orbit="225deg 70deg 100%"
          camera-controls
          shadow-softness="0.7"
          shadow-intensity="1"
          @click="trackModelClick"
        />
      </div>
      <h1>{{ $t('landing.heading') }}</h1>
      <p>{{ $t('landing.tagline') }}</p>
      <!-- This page renders no Navigation, so without the controls here the
           English site would have nothing linking to it. -->
      <LocaleControls />
    </div>
  </div>
</template>

<script setup>
// Only this page renders a model, so the ~260 KB viewer and its assets are
// requested here rather than from the global head on every route.
useHead({
  link: [
    { rel: 'preconnect', href: 'https://ajax.googleapis.com', crossorigin: 'anonymous' },
    // model-viewer fetches its Draco decoder from gstatic as a third hop.
    { rel: 'preconnect', href: 'https://www.gstatic.com', crossorigin: 'anonymous' },
    { rel: 'preload', href: '/images/4wd.png', as: 'image' }
  ],
  script: [
    {
      src: 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js',
      type: 'module'
    }
  ]
})

const trackModelClick = () => {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'model_click', {
      event_category: 'engagement',
      event_label: '3D Model Interaction'
    })
  }
}
</script>
