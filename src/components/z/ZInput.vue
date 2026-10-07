<script setup lang="ts">
import { computed, ref, useAttrs, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'

// class/style — на обёртку (ширина, отступы в раскладке), всё остальное (aria-*, data-*, inputmode,
// autofocus, слушатели onKeydown/onPaste…) — на сам <input>, как у a-input.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

withDefaults(defineProps<{
  value?: string | null
  type?: 'text' | 'password' | 'search' | 'email' | 'tel'
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  allowClear?: boolean
  maxlength?: number
  /** Моноширинный ввод — коды ТН ВЭД, БИН, номера документов. */
  mono?: boolean
  id?: string
  name?: string
  autocomplete?: string
}>(), { value: '', type: 'text', size: 'md' })

const emit = defineEmits<{
  'update:value': [value: string]
  /** На каждый ввод (не на blur), как у a-input: старые экраны вешают автосейв на @change. */
  change: [e: Event]
  pressEnter: [e: KeyboardEvent]
  blur: [e: FocusEvent]
  focus: [e: FocusEvent]
}>()

const { t } = useI18n()
const el = ref<HTMLInputElement>()
defineExpose({ focus: () => el.value?.focus(), blur: () => el.value?.blur() })

const onInput = (e: Event) => {
  emit('update:value', (e.target as HTMLInputElement).value)
  emit('change', e)
}
// Enter, которым подтверждают IME-набор, — не «отправка».
const onEnter = (e: KeyboardEvent) => {
  if (e.isComposing) return
  emit('pressEnter', e)
}
const clear = () => {
  emit('update:value', '')
  el.value?.focus()
}
</script>

<template>
  <span
    :style="attrs.style as StyleValue"
    :class="cn(
      'inline-flex w-full items-center gap-2 rounded-field border border-line-strong bg-surface px-3 text-ink',
      'transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
      'focus-within:border-zircon focus-within:shadow-focus',
      // hover:not-focus-within — в собранном CSS hover идёт после focus-within и перебил бы рамку фокуса.
      !invalid && !disabled && 'hover:not-focus-within:border-faint',
      size === 'sm' ? 'h-7 text-xs' : 'h-9 text-sm',
      invalid && 'border-danger focus-within:border-danger',
      disabled && 'cursor-not-allowed bg-sunken text-ink-3',
      attrs.class as ClassValue,
    )"
  >
    <span v-if="$slots.prefix" :class="cn('flex shrink-0 items-center text-muted', disabled && 'text-ink-3')"><slot name="prefix" /></span>
    <input
      v-bind="inputAttrs"
      :id="id"
      ref="el"
      :name="name"
      :type="type"
      :value="value ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :aria-invalid="invalid || undefined"
      :class="cn(
        'min-w-0 flex-1 border-0 bg-transparent p-0 [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted disabled:cursor-not-allowed disabled:placeholder:text-ink-3',
        mono ? 'font-mono tabular-nums' : 'font-sans',
      )"
      @input="onInput"
      @keydown.enter="onEnter"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    >
    <button
      v-if="allowClear && value && !disabled && !readonly"
      type="button"
      :aria-label="t('common.clear')"
      class="-mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus"
      @click="clear"
    >
      <PhX :size="12" weight="bold" />
    </button>
    <span v-if="$slots.suffix" :class="cn('flex shrink-0 items-center text-muted', disabled && 'text-ink-3')"><slot name="suffix" /></span>
  </span>
</template>
