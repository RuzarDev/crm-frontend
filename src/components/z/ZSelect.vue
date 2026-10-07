<script setup lang="ts">
import { computed, ref, useAttrs, watch, type ComponentPublicInstance, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ComboboxAnchor, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator,
  ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport,
} from 'reka-ui'
import { PhCaretDown, PhCheck, PhCircleNotch, PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fieldShell, floatingSurface, listItem } from '@/ui/surfaces'
import { filterOptions, type ZFilterOption, type ZOption, type ZOptionValue } from '@/ui/options'
import ZSelectChips from './ZSelectChips.vue'

// Замена a-select (155 мест): API как у AntD — v-model:value, options, show-search, filter-option,
// option-filter-prop, mode multiple/tags, allow-clear, status, change(value, option), search.
// class/style — на рамку, остальные $attrs (aria-*, data-*, слушатели) — на <input>.
// Фильтрует наш filterOptions (ignore-filter у Reka): поисковый текст (query) ведём сами — текст в поле
// у single совпадает с подписью выбранного и фильтром быть не должен.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = withDefaults(defineProps<{
  value?: ZOptionValue | ZOptionValue[] | null
  options: ZOption[]
  mode?: 'multiple' | 'tags'
  showSearch?: boolean
  allowClear?: boolean
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  /** Как у a-select: 'error' — красная рамка. */
  status?: 'error' | 'warning' | ''
  invalid?: boolean
  filterOption?: ZFilterOption
  optionFilterProp?: string
  notFoundContent?: string
  loading?: boolean
  id?: string
}>(), { value: null, size: 'md', filterOption: true, optionFilterProp: 'label', status: '' })

const emit = defineEmits<{
  'update:value': [value: ZOptionValue | ZOptionValue[] | null]
  change: [value: ZOptionValue | ZOptionValue[] | null, option: ZOption | ZOption[] | undefined]
  search: [text: string]
  blur: [e: FocusEvent]
  focus: [e: FocusEvent]
}>()

const { t } = useI18n()
const isMulti = computed(() => props.mode === 'multiple' || props.mode === 'tags')
const searchable = computed(() => props.showSearch || props.mode === 'tags')
const isInvalid = computed(() => props.invalid || props.status === 'error')

const byValue = computed(() => new Map(props.options.map((o) => [o.value, o])))
const labelOf = (v: ZOptionValue) => byValue.value.get(v)?.label ?? String(v)
const selected = computed<ZOptionValue[]>(() => {
  if (isMulti.value) return (props.value as ZOptionValue[] | null) ?? []
  return props.value === null || props.value === undefined ? [] : [props.value as ZOptionValue]
})
const displayText = computed(() => (isMulti.value || !selected.value.length ? '' : labelOf(selected.value[0])))

const open = ref(false)
const focused = ref(false)
const query = ref('')
// single с поиском, как у AntD: пока поле в фокусе, оно пустое (набор — сразу поиск, а не дописывание
// к подписи), подпись выбранного видна плейсхолдером; на blur подпись возвращается.
const labelAsPlaceholder = computed(() => searchable.value && !isMulti.value && focused.value)
// Reka зовёт displayValue со своим значением модели (при выборе оно новее, чем props.value).
const displayValue = (v: unknown) =>
  isMulti.value || labelAsPlaceholder.value || v === null || v === undefined || v === '' ? '' : labelOf(v as ZOptionValue)
const inputText = ref(displayText.value)
// Опции часто приходят позже значения (справочник грузится) — подпись в закрытом поле обновляем.
watch(displayText, (text) => { if (!open.value && !labelAsPlaceholder.value) inputText.value = text })

const filtered = computed(() => filterOptions(props.options, searchable.value ? query.value : '', props.filterOption, props.optionFilterProp))
// tags: введённый текст, которого нет среди опций, — первым пунктом (Enter/клик добавляют его), как у AntD.
const tagText = computed(() => (props.mode === 'tags' ? query.value.trim() : ''))
const listOptions = computed<ZOption[]>(() => {
  const text = tagText.value
  const known = !text || selected.value.some((v) => String(v) === text) || props.options.some((o) => String(o.value) === text || o.label === text)
  return known ? filtered.value : [{ value: text, label: text }, ...filtered.value]
})

const set = (next: ZOptionValue | ZOptionValue[] | null) => {
  emit('update:value', next)
  const opt = Array.isArray(next)
    ? next.map((v) => byValue.value.get(v) ?? { value: v, label: String(v) })
    : next === null ? undefined : byValue.value.get(next)
  emit('change', next, opt)
}
const resetSearch = () => {
  query.value = ''
  if (isMulti.value) inputText.value = ''
}
// Reka отдаёт новое значение модели: для single — значение, для multiple — массив.
const onModel = (v: unknown) => {
  set((v as ZOptionValue | ZOptionValue[] | null | undefined) ?? (isMulti.value ? [] : null))
  resetSearch()
}
const onOpen = (v: boolean) => {
  open.value = v
  query.value = ''
}
const onFocus = (e: FocusEvent) => {
  focused.value = true
  if (labelAsPlaceholder.value && inputText.value === displayText.value) inputText.value = ''
  emit('focus', e)
}
const contentCmp = ref<ComponentPublicInstance>()
const onBlur = (e: FocusEvent) => {
  // Фокус ушёл в сам список (на всякий случай: mousedown там отменён) — это не уход из поля.
  const to = e.relatedTarget as Node | null
  if (to && (contentCmp.value?.$el as HTMLElement | undefined)?.contains(to)) return
  focused.value = false
  if (!isMulti.value) {
    query.value = ''
    inputText.value = displayText.value
  }
  emit('blur', e)
}
const applyQuery = (e: Event) => {
  query.value = (e.target as HTMLInputElement).value
  emit('search', query.value)
}
// Во время IME-набора фильтр не дёргаем — текст применится на compositionend.
const onInput = (e: Event) => { if (!(e as InputEvent).isComposing) applyQuery(e) }
const removeValue = (v: ZOptionValue) => set(selected.value.filter((x) => x !== v))
const clear = () => {
  set(isMulti.value ? [] : null)
  resetSearch()
}
const onEnter = (e: KeyboardEvent) => {
  // Подсвеченный пункт Reka выбирает сам (и делает preventDefault). Если подсветки нет — в tags
  // Enter добавляет набранный текст.
  if (props.mode !== 'tags' || e.isComposing || e.defaultPrevented) return
  const text = query.value.trim()
  if (!text) return
  e.preventDefault()
  if (!selected.value.some((v) => String(v) === text)) set([...selected.value, text])
  resetSearch()
}
const onBackspace = (e: KeyboardEvent) => {
  if (!isMulti.value || e.isComposing || inputText.value || !selected.value.length) return
  removeValue(selected.value[selected.value.length - 1])
}

const inputCmp = ref<ComponentPublicInstance>()
const inputEl = () => inputCmp.value?.$el as HTMLInputElement | undefined
// Клик по пустому месту рамки (между метками, справа от текста) — как по полю.
const onAnchorClick = (e: MouseEvent) => {
  if (props.disabled || e.target !== e.currentTarget) return
  inputEl()?.focus()
  inputEl()?.click()
}
defineExpose({ focus: () => inputEl()?.focus(), blur: () => inputEl()?.blur() })
const placeholderText = computed(() => {
  if (labelAsPlaceholder.value && displayText.value) return displayText.value
  return selected.value.length ? undefined : props.placeholder
})
</script>

<template>
  <ComboboxRoot
    :open="open"
    :model-value="isMulti ? selected : value"
    :multiple="isMulti"
    :disabled="disabled"
    ignore-filter
    open-on-click
    @update:open="onOpen"
    @update:model-value="onModel"
  >
    <ComboboxAnchor
      :style="attrs.style as StyleValue"
      :class="cn(fieldShell({ size, invalid: isInvalid, disabled, multiline: isMulti }), 'pr-1.5', !disabled && 'cursor-pointer', attrs.class as ClassValue)"
      @click="onAnchorClick"
    >
      <ZSelectChips v-if="isMulti" :values="selected" :label-of="labelOf" :disabled="disabled" @remove="removeValue" />
      <ComboboxInput
        v-bind="inputAttrs"
        :id="id"
        ref="inputCmp"
        :model-value="inputText"
        :display-value="displayValue"
        :readonly="!searchable"
        :placeholder="placeholderText"
        :aria-invalid="isInvalid || undefined"
        :class="cn(
          'min-w-[4ch] flex-1 border-0 bg-transparent p-0 font-sans [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted',
          // Закрытое поле в фокусе: подпись выбранного — обычным цветом, как значение.
          labelAsPlaceholder && displayText && !open && 'placeholder:text-ink',
          !searchable && 'cursor-pointer caret-transparent',
          disabled && 'cursor-not-allowed placeholder:text-ink-3',
        )"
        @update:model-value="inputText = $event"
        @input="onInput"
        @compositionend="applyQuery"
        @keydown.enter="onEnter"
        @keydown.backspace="onBackspace"
        @blur="onBlur"
        @focus="onFocus"
      />
      <button
        v-if="allowClear && selected.length && !disabled"
        type="button"
        :aria-label="t('common.clear')"
        class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus"
        @click.stop="clear"
      >
        <PhX :size="12" weight="bold" />
      </button>
      <ComboboxTrigger tabindex="-1" class="flex size-5 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-muted outline-hidden disabled:cursor-not-allowed">
        <PhCircleNotch v-if="loading" :size="14" class="animate-spin motion-reduce:animate-none" :aria-label="t('common.loading')" />
        <PhCaretDown v-else :size="14" :class="cn('transition-transform duration-150 ease-out motion-reduce:transition-none', open && 'rotate-180')" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        ref="contentCmp"
        position="popper"
        :side-offset="4"
        :class="cn(floatingSurface, 'w-(--reka-combobox-trigger-width) min-w-48 max-h-72 overflow-hidden')"
        @mousedown.prevent
      >
        <ComboboxViewport class="max-h-70 overflow-y-auto">
          <ComboboxEmpty class="px-2.5 py-2 text-sm text-ink-3">{{ loading ? t('common.loading') : (notFoundContent ?? t('z.noResults')) }}</ComboboxEmpty>
          <ComboboxItem
            v-for="o in listOptions"
            :key="o.value"
            :value="o.value"
            :text-value="o.label"
            :disabled="o.disabled"
            :class="listItem"
          >
            <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
            <ComboboxItemIndicator class="ml-auto flex text-zircon-ink"><PhCheck :size="14" weight="bold" /></ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
