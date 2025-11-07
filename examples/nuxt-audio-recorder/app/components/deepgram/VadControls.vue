<script setup lang="ts">
const props = defineProps<{
  threshold: number;
  smooth: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:threshold': [number];
  'update:smooth': [number];
}>();

const updateThreshold = (event: Event) => {
  const value = Number((event.target as HTMLInputElement | null)?.value ?? props.threshold);
  emit('update:threshold', value);
};

const updateSmooth = (event: Event) => {
  const value = Number((event.target as HTMLInputElement | null)?.value ?? props.smooth);
  emit('update:smooth', value);
};
</script>

<template>
  <div class="grid sm:grid-cols-2 gap-4">
    <div>
      <label class="block text-sm text-gray-400 mb-1">Threshold (dB): {{ threshold }}</label>
      <input type="range" min="-90" max="-5" step="1" :value="threshold" @input="updateThreshold" :disabled="disabled" class="w-full" />
    </div>
    <div>
      <label class="block text-sm text-gray-400 mb-1">Smoothing (ms): {{ smooth }}</label>
      <input type="range" min="5" max="200" step="5" :value="smooth" @input="updateSmooth" :disabled="disabled" class="w-full" />
    </div>
  </div>
</template>
