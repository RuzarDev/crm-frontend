<script setup lang="ts">
import { computed, ref, useAttrs, watch, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretUp } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fieldShell } from '@/ui/surfaces'
import { clampRound, formatFixed, parseNumber } from '@/ui/number'
import { useFieldControl } from '@/ui/form'

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
  /**
   * Как у a-input-number: на каждом нажатии, если текст разобрался в число в пределах [min,max]
   * (сырое, без округления), и ещё раз при коммите (blur/Enter), если нормализация изменила значение;
   * кнопки/стрелки шага — сразу.
   */
  change: [value: number | null]
  pressEnter: [e: KeyboardEvent]
  focus: [e: FocusEvent]
  blur: [e: FocusEvent]
}>()

const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)
// Внутри ZField: id/aria-* поля, красная рамка при ошибке, change/blur — полю (см. src/ui/form.ts).
const { fieldId, fieldDescribedBy, fieldInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, id: () => props.id, focus: () => inputRef.value?.focus(), value: () => props.value,
})
const isInvalid = computed(() => props.invalid || fieldInvalid.value)
const focused = ref(false)
// Были ли правки с момента фокуса: blur без правок не эмитит и не нормализует значение с сервера.
let dirty = false
const show = (v: number | null) => {
  if (v === null || v === undefined) return ''
  return !focused.value && props.precision !== undefined ? formatFixed(v, props.precision) : String(v)
}
const text = ref(show(props.value))
// Последнее отправленное значение: без v-model родителя props.value не меняется, а сравнивать «что эмитить» надо с ним.
let current: number | null = props.value
watch(() => props.value, (v) => {
  current = v
  // В фокусе не трогаем текст, если он уже означает это число: иначе «1.» / «1,5» прыгали бы под кареткой.
  if (focused.value && parseNumber(text.value) === v) return
  text.value = show(v)
})

const send = (v: number | null) => {
  if (v === current) return
  current = v
  emit('update:value', v)
  emit('change', v)
  notifyChange()
}
const commit = (next: number | null) => {
  const v = next === null ? null : clampRound(next, props)
  text.value = show(v)
  dirty = false
  send(v)
}
const commitText = () => {
  if (!dirty) { text.value = show(current); return }
  if (text.value.trim() === '') return commit(null)
  const n = parseNumber(text.value)
  if (n === null) { text.value = show(current); dirty = false } // мусор — откат к прежнему
  else commit(n)
}
// Неполный ввод («1.», «1,», «-», «+») — ждём следующего нажатия, не эмитим.
const isPartial = (s: string) => /[.,+\-\u2212]$/.test(s.trim())
const onInput = (e: Event) => {
  dirty = true
  text.value = (e.target as HTMLInputElement).value // не зависим от порядка слушателей v-model
  if (isPartial(text.value)) return
  const n = parseNumber(text.value)
  if (n === null) return
  if (props.min !== undefined && n < props.min) return
  if (props.max !== undefined && n > props.max) return
  send(n)
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
const onFocus = (e: FocusEvent) => { focused.value = true; dirty = false; emit('focus', e) }
const onBlur = (e: FocusEvent) => { focused.value = false; commitText(); emit('blur', e); notifyBlur() }

defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
})
</script>

<template>
  <span :style="attrs.style as StyleValue" :class="cn(fieldShell({ size, invalid: isInvalid, disabled }), controls && 'pr-1', attrs.class as ClassValue)">
    <input
      v-bind="inputAttrs"
      :id="fieldId"
      ref="inputRef"
      v-model="text"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="isInvalid || undefined"
      :aria-describedby="fieldDescribedBy"
      :aria-required="fieldRequired"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="value ?? undefined"
      role="spinbutton"
      class="min-w-0 flex-1 border-0 bg-transparent p-0 font-sans tabular-nums [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted disabled:cursor-not-allowed disabled:placeholder:text-ink-3"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    >
    <span v-if="controls && !disabled && !readonly" class="flex shrink-0 flex-col">
      <button type="button" tabindex="-1" :aria-label="t('z.increase')" class="flex h-3.5 w-5 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink" @mousedown.prevent @click="stepBy(1)"><PhCaretUp :size="10" weight="bold" /></button>
      <button type="button" tabindex="-1" :aria-label="t('z.decrease')" class="flex h-3.5 w-5 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink" @mousedown.prevent @click="stepBy(-1)"><PhCaretDown :size="10" weight="bold" /></button>
    </span>
  </span>
</template>
