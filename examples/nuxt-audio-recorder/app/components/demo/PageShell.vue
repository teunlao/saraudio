<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  description?: string;
  maxWidth?: '5xl' | '6xl' | '7xl';
}>();

const maxWidthClass = computed(() => `max-w-${props.maxWidth ?? '6xl'}`);
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-8">
    <div :class="[maxWidthClass, 'mx-auto space-y-8']">
      <header class="space-y-2">
        <h1 class="text-3xl font-bold">{{ title }}</h1>
        <p v-if="description" class="text-gray-400">{{ description }}</p>
        <slot name="alert" />
      </header>
      <slot />
    </div>
  </div>
</template>
