<script setup lang="ts">
interface DeviceOption {
  deviceId: string;
  label?: string | null;
}

const props = defineProps<{
  modelValue: string;
  devices: ReadonlyArray<DeviceOption>;
  enumerating?: boolean;
  disabled?: boolean;
  showRefresh?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
  refresh: [];
}>();

const onInput = (event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  if (!target?.value) return;
  emit('update:modelValue', target.value);
};

const refresh = () => emit('refresh');
</script>

<template>
  <div>
    <label class="block text-sm text-gray-400 mb-1">Input Device</label>
    <div class="flex gap-3">
      <select
        :value="modelValue"
        :disabled="disabled || enumerating"
        @input="onInput"
        class="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option v-for="device in devices" :key="device.deviceId" :value="device.deviceId">
          {{ device.label || `Mic ${device.deviceId.slice(0, 6)}` }}
        </option>
      </select>
      <button
        v-if="showRefresh"
        type="button"
        @click="refresh"
        :disabled="enumerating || disabled"
        class="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition whitespace-nowrap"
      >
        {{ enumerating ? 'Scanning…' : 'Refresh' }}
      </button>
    </div>
  </div>
</template>
