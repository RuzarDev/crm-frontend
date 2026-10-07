<script setup lang="ts">
import markUrl from '@/assets/brand/zircon-mark.svg'
import { cn } from '@/ui/cn'

// Знак + слово ZIRCON (брендбук: Manrope 800, разрядка .12em; в Manrope нет казахских букв — только для этого слова).
// Знак декоративный (alt=""): имя логотипа — само слово. inverse — белое слово на тёмном фоне.
// Восьмигранник знака залит navy и на navy-фоне пропадает — остаётся «звезда» граней. Поэтому у inverse
// по контуру знака тонкая белая линия (4 сдвига drop-shadow по 0,5px, 25%) — силуэт шаңырака виден.
const props = withDefaults(defineProps<{ size?: 'sm' | 'md'; inverse?: boolean }>(), { size: 'sm', inverse: false })

const SIZE = {
  sm: { mark: 'size-6', text: 'text-[13px]' },
  md: { mark: 'size-[30px]', text: 'text-[14px]' },
} as const
const INVERSE_OUTLINE = '[filter:drop-shadow(0.5px_0_0_rgb(255_255_255/0.25))_drop-shadow(-0.5px_0_0_rgb(255_255_255/0.25))_drop-shadow(0_0.5px_0_rgb(255_255_255/0.25))_drop-shadow(0_-0.5px_0_rgb(255_255_255/0.25))]'
</script>

<template>
  <span class="inline-flex items-center gap-2.5 select-none">
    <img
      :src="markUrl"
      alt=""
      :class="cn('block shrink-0', SIZE[props.size].mark, props.inverse && INVERSE_OUTLINE)"
      draggable="false"
    >
    <span
      :class="cn(
        '[font-family:Manrope,var(--font-sans)] font-extrabold leading-none tracking-[0.12em]',
        SIZE[props.size].text,
        props.inverse ? 'text-white' : 'text-navy',
      )"
    >ZIRCON</span>
  </span>
</template>
