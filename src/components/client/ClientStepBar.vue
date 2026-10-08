<script setup lang="ts">
import type { SegState } from '@/views/client/shipment'
import { cn } from '@/ui/cn'

// Полоса этапов поставки: 6 сегментов. Сама полоса — картинка (aria-hidden), этап читается текстом из label.
defineProps<{ segments: SegState[]; label: string }>()

// Статические строки — сканер Tailwind должен видеть каждый класс целиком.
const SEG: Record<SegState, string> = {
  done: 'bg-zircon',
  current: 'bg-zircon-ink',
  currentAsk: 'bg-gold',
  currentProblem: 'bg-danger',
  todo: 'bg-line',
}
</script>

<template>
  <span class="block">
    <span class="sr-only" data-step-label>{{ label }}</span>
    <span aria-hidden="true" class="flex gap-[3px]">
      <span
        v-for="(s, i) in segments"
        :key="i"
        :data-seg="s"
        :class="cn('h-1.5 flex-1 rounded-pill transition-colors duration-200 motion-reduce:transition-none', SEG[s])"
      />
    </span>
  </span>
</template>
