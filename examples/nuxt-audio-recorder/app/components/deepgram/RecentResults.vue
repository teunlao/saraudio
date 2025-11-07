<script setup lang="ts">
import type { TranscriptResult } from '@saraudio/core';

defineProps<{
  results: ReadonlyArray<TranscriptResult>;
}>();
</script>

<template>
  <div class="p-6 bg-gray-800 rounded space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold">Recent results</h2>
      <span class="text-xs text-gray-400">{{ results.length }} shown</span>
    </div>
    <div class="max-h-72 overflow-y-auto space-y-3">
      <div v-for="(result, index) in results" :key="index" class="bg-gray-900 border border-gray-700 rounded p-3 space-y-1">
        <div class="text-sm text-gray-400">
          {{ result.language ?? '-' }} · confidence:
          {{ result.confidence !== undefined ? result.confidence.toFixed(2) : '—' }}
        </div>
        <div class="text-gray-100 whitespace-pre-wrap leading-snug">{{ result.text }}</div>
      </div>
      <p v-if="results.length === 0" class="text-sm text-gray-500 text-center py-4">No transcripts yet…</p>
    </div>
  </div>
</template>
