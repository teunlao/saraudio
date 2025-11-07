<script setup lang="ts">
const props = defineProps<{
  events: ReadonlyArray<string>;
}>();

const emit = defineEmits<{ clear: [] }>();

const clear = () => emit('clear');
</script>

<template>
  <div class="p-6 bg-gray-800 rounded space-y-3">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold">Event log</h2>
      <button
        class="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
        :disabled="props.events.length === 0"
        @click="clear"
      >
        Clear Log
      </button>
    </div>
    <div class="max-h-64 overflow-y-auto font-mono text-xs bg-gray-900 border border-gray-700 rounded p-3 space-y-1">
      <p v-if="props.events.length === 0" class="text-gray-500 text-center py-4">No events yet…</p>
      <p v-for="(entry, index) in props.events" :key="`${entry}-${index}`" class="text-gray-300 whitespace-pre-wrap">
        {{ entry }}
      </p>
    </div>
  </div>
</template>
