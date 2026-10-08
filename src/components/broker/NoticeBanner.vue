<script setup lang="ts">
import { cn } from '@/ui/cn'

// Плашка «нужно внимание» над списком. gold — нужно действие брокера (тёплая, главная кнопка — в слот action);
// neutral — информация или риск без срочности (красная точка, кнопка-контур).
withDefaults(defineProps<{ tone?: 'gold' | 'neutral' }>(), { tone: 'gold' })
</script>

<template>
  <div
    role="status"
    :class="cn(
      'flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2.5 rounded-panel border px-5 py-3 text-sm text-ink max-sm:py-3.5',
      tone === 'gold' ? 'border-gold-line bg-gold-soft' : 'border-line bg-canvas',
    )"
  >
    <span data-notice-dot :class="cn('size-[7px] shrink-0 rounded-pill', tone === 'gold' ? 'bg-gold' : 'bg-danger')" aria-hidden="true" />
    <div class="min-w-0 flex-1 basis-60"><slot /></div>
    <div v-if="$slots.action" class="shrink-0 max-sm:w-full [&>*]:max-sm:w-full"><slot name="action" /></div>
  </div>
</template>
