<script setup lang="ts">
import { cn } from '@/ui/cn'
import type { StageCell } from './autoTransit'

// Полоса этапов «Авто-транзита»: равные деления по числу этапов. Пройден — зелёный (тон done), текущий — циркон,
// текущий с препятствием или «Проблемой» — золото, впереди — линия. label — текст для экранного диктора (role=img).
defineProps<{ steps: StageCell[]; label?: string }>()

const CELL: Record<StageCell, string> = {
  done: 'bg-tone-done-fg',
  current: 'bg-zircon',
  warn: 'bg-gold',
  todo: 'bg-line-strong',
}
</script>

<template>
  <div role="img" :aria-label="label" class="flex items-center gap-[3px]">
    <span v-for="(s, i) in steps" :key="i" :data-step="s" :class="cn('h-1.5 min-w-0 flex-1 rounded-pill', CELL[s])" />
  </div>
</template>
