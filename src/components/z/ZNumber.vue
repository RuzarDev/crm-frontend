<script setup lang="ts">
import { computed, ref, useAttrs, watch, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretUp } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fieldShell } from '@/ui/surfaces'
import { clampRound, parseNumber } from '@/ui/number'

// class/style — на обёртку, остальное — на <input> (контракт Z-полей, см. ZInput).
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = withDefaults(defineProps<{
  value?: number | null
  min?: number
  max?: number
  precision?: number
  step?: number
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  /** Кнопки ±шаг справа (у AntD были по умолчанию; у нас — по запросу). */
  controls?: boolean
  id?: string
}>(), { value: null, step: 1, size: 'md', controls: false })

const emit = defineEmits<{
  'update:value': [value: number | null]
  /** Как у a-input-number: при коммите значения (blur, Enter, шаг). */
  change: [value: number | null]
  pressEnter: [e: KeyboardEvent]
  blur: [e: FocusEvent]
}>()

const { t } = useI18n()
const show = (v: number | null) => (v === null || v === undefined ? '' : String(v))
const text = ref(show(props.value))
// Последнее закоммиченное значение: без v-model родителя props.value не меняется, а сравнивать «что эмитить» надо с ним.
let current: number | null = props.value
watch(() => props.value, (v) => { current = v; text.value = show(v) })

const commit = (next: number | null) => {
  const v = next === null ? null : clampRound(next, props)
  text.value = show(v)
  if (v !== current) {
    current = v
    emit('update:value', v)
    emit('change', v)
  }
}
const commitText = () => {
  if (text.value.trim() === '') return commit(null)
  const n = parseNumber(text.value)
  if (n === null) text.value = show(current) // мусор — откат к прежнему
  else commit(n)
}
const stepBy = (dir: 1 | -1) => {
  if (props.disabled || props.readonly) return
  const base = parseNumber(text.value) ?? current ?? 0
  commit(clampRound(base + dir * props.step, { precision: props.precision ?? 10 }))
}
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1) }
  else if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1) }
  else if (e.key === 'Enter' && !e.isComposing) { commitText(); emit('pressEnter', e) }
}
const onBlur = (e: FocusEvent) => { commitText(); emit('blur', e) }
</script>

<template>
  <span :style="attrs.style as StyleValue" :class="cn(fieldShell({ size, invalid, disabled }), controls && 'pr-1', attrs.class as ClassValue)">
    <input
      v-bind="inputAttrs"
      :id="id"
      v-model="text"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="invalid || undefined"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="value ?? undefined"
      role="spinbutton"
      class="min-w-0 flex-1 border-0 bg-transparent p-0 font-sans tabular-nums [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted disabled:cursor-not-allowed disabled:placeholder:text-ink-3"
      @keydown="onKeydown"
      @blur="onBlur"
    >
    <span v-if="controls && !disabled && !readonly" class="flex shrink-0 flex-col">
      <button type="button" tabindex="-1" :aria-label="t('z.increase')" class="flex h-3.5 w-5 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink" @click="stepBy(1)"><PhCaretUp :size="10" weight="bold" /></button>
      <button type="button" tabindex="-1" :aria-label="t('z.decrease')" class="flex h-3.5 w-5 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink" @click="stepBy(-1)"><PhCaretDown :size="10" weight="bold" /></button>
    </span>
  </span>
</template>
