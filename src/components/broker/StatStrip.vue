<script setup lang="ts">
import { cn } from '@/ui/cn'
import ZSkeleton from '@/components/z/ZSkeleton.vue'

// Полоса показателей: одна панель, ячейки через вертикальный разделитель (на телефоне — 2 колонки, разделители сверху).
// Подпись — до двух строк: длинная (kk, узкая ячейка) переносится, а не обрезается многоточием.
// tone — точка перед подписью: gold — нужно действие, done — готово, danger — проблема.
export interface StatItem {
  key: string
  label: string
  value: string
  hint?: string
  tone?: 'gold' | 'done' | 'danger' | null
  /** Подсказка к значению (title), например полная сумма у «18,2 млн ₸». */
  valueTitle?: string
  /** Цвет подсказки: up — рост (зелёный), down — падение (красный); без него — приглушённый. */
  hintTone?: 'up' | 'down' | null
}

withDefaults(defineProps<{ items: StatItem[]; loading?: boolean }>(), { loading: false })

const HINT: Record<'up' | 'down', string> = { up: 'text-tone-done-fg', down: 'text-tone-danger-fg' }
const DOT: Record<NonNullable<StatItem['tone']>, string> = {
  gold: 'bg-gold',
  done: 'bg-tone-done-fg',
  danger: 'bg-danger',
}
</script>

<template>
  <div
    class="grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-surface sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none"
    :aria-busy="loading ? 'true' : undefined"
  >
    <div
      v-for="(it, i) in items"
      :key="it.key"
      data-stat-cell
      :class="cn('min-w-0 border-line px-5 py-4', i > 0 && 'sm:border-l', i >= 2 && 'max-sm:border-t')"
    >
      <div class="flex items-start gap-1.5 text-[12.5px] leading-4 text-muted">
        <span v-if="it.tone" data-stat-dot :class="cn('mt-1 size-[7px] shrink-0 rounded-pill', DOT[it.tone])" aria-hidden="true" />
        <span class="min-w-0 line-clamp-2 break-words" data-stat-label>{{ it.label }}</span>
      </div>
      <ZSkeleton v-if="loading" class="mt-1.5" width="60%" height="22px" />
      <div v-else class="mt-0.5 text-[22px] leading-[30px] font-semibold text-ink tabular-nums" :title="it.valueTitle" data-stat-value>{{ it.value }}</div>
      <div v-if="it.hint && !loading" data-stat-hint :class="cn('mt-0.5 text-[12.5px]', it.hintTone ? HINT[it.hintTone] : 'text-muted')">{{ it.hint }}</div>
    </div>
  </div>
</template>
