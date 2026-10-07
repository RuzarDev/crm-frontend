<script setup lang="ts">
import { computed, ref, useAttrs, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhEye, PhEyeSlash, PhMagnifyingGlass, PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fieldShell } from '@/ui/surfaces'
import { useFieldControl } from '@/ui/form'

// class/style — на обёртку (ширина, отступы в раскладке), всё остальное (aria-*, data-*, inputmode,
// autofocus, слушатели onKeydown/onPaste…) — на сам <input>, как у a-input.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const props = withDefaults(defineProps<{
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
  /** type=search: кнопка справа внутри рамки (true — значок лупы, строка — текст кнопки). */
  enterButton?: boolean | string
}>(), { value: '', type: 'text', size: 'md' })

const emit = defineEmits<{
  'update:value': [value: string]
  /** На каждый ввод (не на blur), как у a-input: старые экраны вешают автосейв на @change. */
  change: [e: Event]
  pressEnter: [e: KeyboardEvent]
  blur: [e: FocusEvent]
  focus: [e: FocusEvent]
  /** type=search: Enter (без IME) или кнопка enterButton. */
  search: [value: string]
}>()

const { t } = useI18n()
const el = ref<HTMLInputElement>()
defineExpose({ focus: () => el.value?.focus(), blur: () => el.value?.blur() })
// Внутри ZField: id/aria-* поля, красная рамка при ошибке, change/blur — полю (см. src/ui/form.ts).
const { fieldId, fieldDescribedBy, fieldInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, id: () => props.id, focus: () => el.value?.focus(), value: () => props.value,
})
const isInvalid = computed(() => props.invalid || fieldInvalid.value)

// Пароль: глаз переключает отображение; type у <input> становится text.
const shown = ref(false)
const isPassword = computed(() => props.type === 'password')
const isSearch = computed(() => props.type === 'search')
const inputType = computed(() => (isPassword.value && shown.value ? 'text' : props.type))
const inputAutocomplete = computed(() => props.autocomplete ?? (isPassword.value ? 'current-password' : undefined))
const doSearch = () => emit('search', props.value ?? '')

const onInput = (e: Event) => {
  emit('update:value', (e.target as HTMLInputElement).value)
  emit('change', e)
  notifyChange()
}
const onBlur = (e: FocusEvent) => {
  emit('blur', e)
  notifyBlur()
}
// Enter, которым подтверждают IME-набор, — не «отправка».
const onEnter = (e: KeyboardEvent) => {
  if (e.isComposing) return
  emit('pressEnter', e)
  if (isSearch.value) doSearch()
}
// Очистка — как ввод: поле пустеет и получает настоящее событие input, поэтому onInput шлёт
// update:value('') и change(Event) с target = <input> (a-input тоже шлёт change при очистке — автосейв).
const clear = () => {
  const input = el.value
  if (!input) return emit('update:value', '')
  input.value = ''
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.focus()
}
</script>

<template>
  <span
    :style="attrs.style as StyleValue"
    :class="cn(
      fieldShell({ size, invalid: isInvalid, disabled }),
      attrs.class as ClassValue,
    )"
  >
    <span v-if="$slots.prefix" :class="cn('flex shrink-0 items-center text-muted', disabled && 'text-ink-3')"><slot name="prefix" /></span>
    <span v-else-if="isSearch" :class="cn('flex shrink-0 items-center text-muted', disabled && 'text-ink-3')"><PhMagnifyingGlass :size="16" /></span>
    <input
      v-bind="inputAttrs"
      :id="fieldId"
      ref="el"
      :name="name"
      :type="inputType"
      :value="value ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :maxlength="maxlength"
      :autocomplete="inputAutocomplete"
      :aria-invalid="isInvalid || undefined"
      :aria-describedby="fieldDescribedBy"
      :aria-required="fieldRequired"
      :class="cn(
        'min-w-0 flex-1 border-0 bg-transparent p-0 [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted disabled:cursor-not-allowed disabled:placeholder:text-ink-3',
        mono ? 'font-mono tabular-nums' : 'font-sans',
        isSearch && '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
      )"
      @input="onInput"
      @keydown.enter="onEnter"
      @blur="onBlur"
      @focus="emit('focus', $event)"
    >
    <button
      v-if="allowClear && value && !disabled && !readonly"
      type="button"
      :aria-label="t('common.clear')"
      class="-mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus"
      @click="clear"
    >
      <PhX :size="12" weight="bold" />
    </button>
    <button
      v-if="isPassword && !disabled"
      type="button"
      :aria-label="shown ? t('z.hidePassword') : t('z.showPassword')"
      :aria-pressed="shown"
      class="-mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus"
      @mousedown.prevent
      @click="shown = !shown"
    >
      <component :is="shown ? PhEyeSlash : PhEye" :size="16" />
    </button>
    <span v-if="$slots.suffix" :class="cn('flex shrink-0 items-center text-muted', disabled && 'text-ink-3')"><slot name="suffix" /></span>
    <button
      v-if="isSearch && enterButton && !disabled"
      type="button"
      :aria-label="typeof enterButton === 'string' ? undefined : t('z.search')"
      class="-mr-3 flex h-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-r-[7px] border-0 bg-navy px-3 font-sans text-sm font-semibold text-white outline-hidden hover:bg-navy-hover focus-visible:shadow-focus"
      @mousedown.prevent
      @click="doSearch"
    >
      <template v-if="typeof enterButton === 'string'">{{ enterButton }}</template>
      <PhMagnifyingGlass v-else :size="16" weight="bold" />
    </button>
  </span>
</template>
