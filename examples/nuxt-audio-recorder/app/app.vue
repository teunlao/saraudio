<script setup lang="ts">
// App shell with top navigation
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <nav class="bg-gray-800 border-b border-gray-700">
      <div class="max-w-6xl mx-auto px-6 py-3 flex gap-4 items-center">
        <NuxtLink to="/" class="px-3 py-1 rounded hover:bg-gray-700">Home</NuxtLink>
        <NuxtLink to="/deepgram-manual" class="px-3 py-1 rounded hover:bg-gray-700">Deepgram Manual</NuxtLink>
        <NuxtLink to="/deepgram-with-hooks" class="px-3 py-1 rounded hover:bg-gray-700">Deepgram with Hooks</NuxtLink>
      </div>
    </nav>
    <NuxtPage />
  </div>
</template>
