<script setup lang="ts">
import markUrl from '@/assets/brand/zircon-mark.svg'
import { cn } from '@/ui/cn'

// Знак + слово ZIRCON (брендбук: Manrope 800, разрядка .12em; в Manrope нет казахских букв — только для этого слова).
// Знак декоративный (alt=""): имя логотипа — само слово. inverse — белое слово на тёмном фоне.
const props = withDefaults(defineProps<{ size?: 'sm' | 'md'; inverse?: boolean }>(), { size: 'sm', inverse: false })

const SIZE = {
  sm: { mark: 'size-6', text: 'text-[13px]' },
  md: { mark: 'size-[30px]', text: 'text-[14px]' },
} as const
</script>

<template>
  <span class="inline-flex items-center gap-2.5 select-none">
    <img :src="markUrl" alt="" :class="cn('block shrink-0', SIZE[props.size].mark)" draggable="false">
    <span
      :class="cn(
        '[font-family:Manrope,var(--font-sans)] font-extrabold leading-none tracking-[0.12em]',
        SIZE[props.size].text,
        props.inverse ? 'text-white' : 'text-navy',
      )"
    >ZIRCON</span>
  </span>
</template>
