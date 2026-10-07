<script setup lang="ts">
import { computed, useAttrs } from 'vue'
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

// class из родителя сливаем через cn: иначе bg-surface рядом с bg-sunken решал бы порядок в CSS, а не намерение.
defineOptions({ inheritAttrs: false })
// $attrs не реактивен для computed, поэтому слияние — функциями, вызываемыми из шаблона.
// Своё aria-disabled/aria-busy ставим только при loading (и тогда оно главнее); иначе значения родителя проходят как есть.
const attrs = useAttrs()
const buttonAttrs = () => {
  const { class: _class, ...others } = attrs
  return props.loading ? { ...others, 'aria-disabled': 'true', 'aria-busy': 'true' } : others
}

const emit = defineEmits<{ click: [e: MouseEvent] }>()

// Главное действие — navy (одно на экран), акцент zircon сюда не идёт (спека §3).
const VARIANT: Record<ZButtonVariant, string> = {
  primary: 'bg-navy text-white',
  secondary: 'bg-sunken text-ink',
  ghost: 'bg-transparent text-ink-2',
  danger: 'bg-danger text-white',
  'danger-ghost': 'bg-transparent text-danger',
  link: 'bg-transparent text-zircon-ink h-auto px-0 underline-offset-4',
}
// Hover — только у доступной кнопки: enabled: снимает его с disabled, а у loading словарь не подключается вовсе.
const HOVER: Record<ZButtonVariant, string> = {
  primary: 'enabled:hover:bg-navy-hover',
  secondary: 'enabled:hover:bg-line-strong',
  ghost: 'enabled:hover:bg-sunken enabled:hover:text-ink',
  danger: 'enabled:hover:bg-danger-hover',
  'danger-ghost': 'enabled:hover:bg-tone-danger-bg enabled:hover:text-tone-danger-fg',
  link: 'enabled:hover:underline',
}
const SIZE: Record<ZButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
}

const interactive = computed(() => !props.disabled && !props.loading)

const classes = computed(() => cn(
  'inline-flex items-center justify-center rounded-field border-0 font-sans font-semibold whitespace-nowrap select-none cursor-pointer',
  // active:scale-* в Tailwind 4 пишет свойство scale (не transform) — его и анимируем.
  'transition-[background-color,color,scale] duration-150 ease-out motion-reduce:transition-none',
  'outline-hidden focus-visible:shadow-focus',
  // Выключенный вид — только у настоящего disabled; loading остаётся в полном цвете.
  'disabled:cursor-not-allowed disabled:opacity-45',
  SIZE[props.size],
  VARIANT[props.variant],
  interactive.value && HOVER[props.variant],
  interactive.value && 'motion-safe:active:scale-[0.98]',
  props.loading && 'cursor-progress',
  props.block && 'w-full',
))

// Во время loading кнопка не выключена нативно (не серая, фокус не теряется), поэтому клик глотаем сами:
// без emit и с preventDefault — чтобы htmlType=submit не отправил форму второй раз.
const onClick = (e: MouseEvent) => {
  if (props.loading) {
    e.preventDefault()
    return
  }
  emit('click', e)
}
</script>

<template>
  <button
    v-bind="buttonAttrs()"
    :type="htmlType"
    :class="cn(classes, $attrs.class as string)"
    :disabled="disabled"
    @click="onClick"
  >
    <span
      v-if="loading"
      data-z-spin
      aria-hidden="true"
      class="size-3.5 shrink-0 rounded-pill border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none"
    />
    <slot v-else name="icon" />
    <slot />
  </button>
</template>
