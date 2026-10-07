<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/ui/cn'

export type ZButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'link'
export type ZButtonSize = 'sm' | 'md'

const props = withDefaults(defineProps<{
  variant?: ZButtonVariant
  size?: ZButtonSize
  loading?: boolean
  disabled?: boolean
  block?: boolean
  htmlType?: 'button' | 'submit' | 'reset'
}>(), { variant: 'secondary', size: 'md', loading: false, disabled: false, block: false, htmlType: 'button' })

// Главное действие — navy (одно на экран), акцент zircon сюда не идёт (спека §3).
const VARIANT: Record<ZButtonVariant, string> = {
  primary: 'bg-navy text-white hover:bg-navy-hover',
  secondary: 'bg-sunken text-ink hover:bg-line',
  ghost: 'bg-transparent text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger-hover',
  'danger-ghost': 'bg-transparent text-danger hover:bg-tone-danger-bg',
  link: 'bg-transparent text-zircon-ink hover:underline underline-offset-4 h-auto px-0',
}
const SIZE: Record<ZButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
}

const classes = computed(() => cn(
  'inline-flex items-center justify-center rounded-field border-0 font-sans font-semibold whitespace-nowrap select-none cursor-pointer',
  'transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
  'outline-none focus-visible:shadow-focus',
  'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
  SIZE[props.size],
  VARIANT[props.variant],
  props.block && 'w-full',
))
</script>

<template>
  <button :type="htmlType" :class="classes" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <span
      v-if="loading"
      data-z-spin
      aria-hidden="true"
      class="size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none"
    />
    <slot v-else name="icon" />
    <slot />
  </button>
</template>
