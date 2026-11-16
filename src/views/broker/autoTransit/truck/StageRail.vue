<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import type { RailCell } from './truckView'

// Семь этапов границы (макет 2 — строка с кружками; макет 3, правый телефон — список). Одна разметка:
// до 1024 px — вертикальный список (кружок, название, время справа), шире — семь колонок по центру.
defineProps<{ cells: RailCell[] }>()
const { t } = useI18n()

const DOT: Record<RailCell['state'], string> = {
  done: 'border-tone-done-fg bg-tone-done-fg text-white',
  current: 'border-zircon bg-surface text-zircon-ink shadow-[0_0_0_4px_var(--color-zircon-soft)]',
  warn: 'border-gold bg-gold-soft text-gold-ink',
  todo: 'border-line-strong bg-surface text-muted',
}
</script>

<template>
  <ol
    class="m-0 grid list-none grid-cols-1 p-0 lg:grid-cols-7 lg:gap-1"
    :aria-label="t('broker.autoTransit.truck.stagesLabel')"
    data-stage-rail
  >
    <li
      v-for="c in cells"
      :key="c.stage"
      :class="cn(
        'flex min-w-0 items-center gap-2.5 border-b border-line py-2.5 last:border-b-0 lg:flex-col lg:gap-2 lg:border-b-0 lg:px-1 lg:py-0 lg:text-center',
        (c.state === 'current' || c.state === 'warn') && 'font-semibold',
      )"
      :aria-current="c.state === 'current' || c.state === 'warn' ? 'step' : undefined"
      :data-rail-stage="c.stage"
      :data-state="c.state"
    >
      <span :class="cn('grid size-7 shrink-0 place-items-center rounded-pill border-2 font-mono text-xs', DOT[c.state])" aria-hidden="true">
        <PhCheck v-if="c.state === 'done'" :size="14" weight="bold" />
        <template v-else>{{ c.stage }}</template>
      </span>
      <span class="min-w-0 flex-1 text-sm leading-[18px] text-ink lg:flex-none">{{ c.name }}</span>
      <span class="shrink-0 text-xs font-normal text-muted tabular-nums lg:min-h-4" data-rail-meta>{{ c.meta }}</span>
      <span v-if="c.state === 'done'" class="sr-only">{{ t('broker.autoTransit.truck.rail.doneSr') }}</span>
    </li>
  </ol>
</template>
