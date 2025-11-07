<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  dense?: boolean;
  className?: string;
}>();

const paddingClass = computed(() => (props.dense ? 'p-4' : 'p-6'));
const extraClass = computed(() => props.className ?? '');
</script>

<template>
  <section :class="['bg-gray-800 rounded space-y-4', paddingClass, extraClass]">
    <slot />
  </section>
</template>
