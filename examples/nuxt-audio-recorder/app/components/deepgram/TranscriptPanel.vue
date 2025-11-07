<script setup lang="ts">
const props = defineProps<{
  transcript?: string;
  partial?: string;
}>();

const emit = defineEmits<{ clear: [] }>();

const clear = () => emit('clear');
</script>

<template>
  <div class="p-6 bg-gray-800 rounded space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold">Transcript</h2>
      <button
        class="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
        :disabled="!props.transcript && !props.partial"
        @click="clear"
      >
        Clear
      </button>
    </div>
    <div class="min-h-48 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded p-4 space-y-4">
      <div v-if="!props.transcript && !props.partial" class="text-sm text-gray-500 text-center py-6">
        Waiting for speech…
      </div>
      <div v-else>
        <p v-if="props.transcript" class="text-gray-100 whitespace-pre-wrap leading-relaxed">
          {{ props.transcript }}
        </p>
        <p v-if="props.partial" class="text-gray-400 italic whitespace-pre-wrap leading-relaxed">
          {{ props.partial }}
        </p>
      </div>
    </div>
  </div>
</template>
