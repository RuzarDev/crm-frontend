<script setup lang="ts">
import { cn } from '@/ui/cn'

export type ZTone = 'neutral' | 'info' | 'wait' | 'submitted' | 'done' | 'pay' | 'danger' | 'accent'

withDefaults(defineProps<{ tone?: ZTone; size?: 'sm' | 'md' }>(), { tone: 'neutral', size: 'md' })

// Статические строки — сканер Tailwind должен видеть каждый класс целиком.
const TONE: Record<ZTone, string> = {
  neutral: 'bg-tone-neutral-bg text-tone-neutral-fg',
  info: 'bg-tone-info-bg text-tone-info-fg',
  wait: 'bg-tone-wait-bg text-tone-wait-fg',
  submitted: 'bg-tone-submitted-bg text-tone-submitted-fg',
  done: 'bg-tone-done-bg text-tone-done-fg',
  pay: 'bg-tone-pay-bg text-tone-pay-fg',
  danger: 'bg-tone-danger-bg text-tone-danger-fg',
  accent: 'bg-gold-soft text-gold-ink',
}
</script>

<template>
  <span
    :class="cn(
      'inline-flex items-center whitespace-nowrap rounded-pill font-semibold',
      size === 'sm' ? 'h-5 px-2 text-xs' : 'h-6 px-2.5 text-xs',
      TONE[tone],
    )"
  >
    <slot />
  </span>
</template>
