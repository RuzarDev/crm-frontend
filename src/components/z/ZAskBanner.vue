<script setup lang="ts">
import { PhWarning } from '@phosphor-icons/vue'
import ZButton from './ZButton.vue'

// «Нужно от вас»: единственное место, где используется gold (спека §3).
defineProps<{ title: string; description?: string; actionText?: string }>()
const emit = defineEmits<{ action: [e: MouseEvent] }>()
</script>

<template>
  <div role="status" class="flex items-center gap-3 rounded-panel border border-gold-line bg-gold-soft px-4 py-3 max-sm:flex-wrap">
    <span aria-hidden="true" class="inline-flex size-8 shrink-0 items-center justify-center rounded-row bg-gold text-navy">
      <slot name="icon"><PhWarning :size="18" weight="bold" /></slot>
    </span>
    <div class="min-w-0 flex-1">
      <div class="font-semibold text-ink">{{ title }}</div>
      <div v-if="$slots.default || description" class="mt-0.5 text-sm text-ink-2"><slot>{{ description }}</slot></div>
    </div>
    <div v-if="$slots.action || actionText" class="shrink-0 max-sm:w-full">
      <slot name="action">
        <ZButton class="bg-surface enabled:hover:bg-canvas max-sm:w-full" @click="emit('action', $event)">{{ actionText }}</ZButton>
      </slot>
    </div>
  </div>
</template>
