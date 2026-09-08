<script setup lang="ts">
const localePath = useLocalePath()
</script>

<template>
  <nav class="nav">
    <NuxtLink :to="localePath('/')">{{ $t('nav.home') }}</NuxtLink>
    <NuxtLink :to="localePath('/guides')">{{ $t('nav.guides') }}</NuxtLink>
    <NuxtLink :to="localePath('/parts')">{{ $t('nav.parts') }}</NuxtLink>
    <NuxtLink :to="localePath('/build')">{{ $t('nav.build') }}</NuxtLink>
    <NuxtLink :to="localePath('/about')">{{ $t('nav.about') }}</NuxtLink>
    <LocaleControls />
  </nav>
</template>
