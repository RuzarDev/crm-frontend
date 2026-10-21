<script setup lang="ts">
import type { ZTone } from '@/components/z/ZTag.vue'

// Точка тона и подпись в одну строку. Для узкой колонки (статус товара ДТ, 124px):
//   sub  — вторая строка мельче и тише («ещё 2»), как вторая величина в ячейке весов;
//   wrap — длинная подпись («Нет в справочнике») переносится по словам, а не раздвигает таблицу.
// Тогда точка — у первой строки (mt — по середине заглавных при leading-tight), а не по центру всего блока.
defineProps<{ tone: ZTone; label: string; sub?: string; wrap?: boolean }>()

// Статические строки — сканер Tailwind должен видеть каждый класс целиком.
const DOT: Record<ZTone, string> = {
  neutral: 'bg-tone-neutral-fg',
  info: 'bg-tone-info-fg',
  wait: 'bg-tone-wait-fg',
  submitted: 'bg-tone-submitted-fg',
  done: 'bg-tone-done-fg',
  pay: 'bg-tone-pay-fg',
  danger: 'bg-tone-danger-fg',
  accent: 'bg-gold-ink',
}
</script>

<template>
  <span v-if="!sub && !wrap" class="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-2">
    <span aria-hidden="true" :class="['size-[7px] shrink-0 rounded-pill', DOT[tone]]" />{{ label }}
  </span>
  <span v-else class="inline-flex min-w-0 items-start gap-1.5 text-sm leading-tight text-ink-2">
    <span aria-hidden="true" :class="['mt-[5px] size-[7px] shrink-0 rounded-pill', DOT[tone]]" />
    <span class="flex min-w-0 flex-col">
      <span :class="!wrap && 'whitespace-nowrap'" data-status-label>{{ label }}</span>
      <span v-if="sub" class="text-xs whitespace-nowrap text-ink-3" data-status-sub>{{ sub }}</span>
    </span>
  </span>
</template>
