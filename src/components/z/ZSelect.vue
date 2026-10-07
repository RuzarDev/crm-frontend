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
import {
  filterOptions, fromKey, indexOptions, optionFor, sameValue, toKey, type ZFilterOption, type ZOption, type ZOptionValue,
} from '@/ui/options'
import ZSelectChips from './ZSelectChips.vue'

// Замена a-select (155 мест): API как у AntD — v-model:value, options, show-search, filter-option,
// option-filter-prop, mode multiple/tags, allow-clear, status, change(value, option), search.
// class/style — на корневой DOM-элемент (ComboboxRoot, база inline-flex w-full min-w-0; рамка внутри — w-full),
// остальные $attrs (aria-*, data-*, слушатели) — на <input>.
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
  /** По умолчанию: single — без поиска, multiple/tags — с поиском (как у AntD). */
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
  /** Минимальная ширина окна списка (число — px, строка — как есть, '420px', '30rem'); по умолчанию —
   *  ширина поля. Замена dropdownMatchSelectWidth/dropdownStyle у a-select; как у ZCombobox. */
  popupWidth?: number | string
}>(), { value: null, showSearch: undefined, size: 'md', filterOption: true, optionFilterProp: 'label', status: '' })

const emit = defineEmits<{
  'update:value': [value: ZOptionValue | ZOptionValue[] | null]
  change: [value: ZOptionValue | ZOptionValue[] | null, option: ZOption | ZOption[] | undefined]
  search: [text: string]
  blur: [e: FocusEvent]
  focus: [e: FocusEvent]
}>()

const { t } = useI18n()
const isMulti = computed(() => props.mode === 'multiple' || props.mode === 'tags')
// Как у AntD: multiple/tags — с поиском по умолчанию, single — без; show-search переопределяет.
const searchable = computed(() => props.showSearch ?? isMulti.value)
const isInvalid = computed(() => props.invalid || props.status === 'error')

const index = computed(() => indexOptions(props.options))
const labelOf = (v: ZOptionValue) => optionFor(index.value, v).label
const selected = computed<ZOptionValue[]>(() => {
  if (isMulti.value) return (props.value as ZOptionValue[] | null) ?? []
  return props.value === null || props.value === undefined ? [] : [props.value as ZOptionValue]
})
const displayText = computed(() => (isMulti.value || !selected.value.length ? '' : labelOf(selected.value[0])))
// Reka работает с ключами (toKey: '' → служебный ключ) и зовёт displayValue со своим значением модели
// (при выборе оно новее, чем props.value).
const rekaModel = computed(() => (isMulti.value ? selected.value.map(toKey) : selected.value.length ? toKey(selected.value[0]) : null))
const displayValue = (k: unknown) => (isMulti.value || k === null || k === undefined ? '' : labelOf(fromKey(k)))

const open = ref(false)
const query = ref('')
const inputText = ref(displayText.value)
// В поле — нетронутая подпись выбранного (а не набранный текст, пусть даже совпавший с ней): ставится,
// когда поле получает подпись (монтирование, blur, выбор, закрытие, смена значения), снимается первой правкой.
const pristine = ref(true)
// Опции часто приходят позже значения (справочник грузится) — подпись в закрытом поле обновляем.
watch(displayText, (text) => {
  if (open.value) return
  inputText.value = text
  pristine.value = true
})

const filtered = computed(() => filterOptions(props.options, searchable.value ? query.value : '', props.filterOption, props.optionFilterProp))
// tags: введённый текст, которого нет среди опций, — первым пунктом (Enter/клик добавляют его), как у AntD.
const tagText = computed(() => (props.mode === 'tags' ? query.value.trim() : ''))
const listOptions = computed<ZOption[]>(() => {
  const text = tagText.value
  const known = !text || selected.value.some((v) => String(v) === text) || props.options.some((o) => String(o.value) === text || o.label === text)
  return known ? filtered.value : [{ value: text, label: text }, ...filtered.value]
})

const set = (next: ZOptionValue | ZOptionValue[] | null) => {
  // Как triggerChange у AntD: повторный выбор того же значения — без update/change.
  if (sameValue(props.value, next)) return
  emit('update:value', next)
  emit('change', next, Array.isArray(next) ? next.map((v) => optionFor(index.value, v)) : next === null ? undefined : index.value.get(next))
}
const resetQuery = () => {
  if (!query.value) return
  query.value = ''
  emit('search', '')
}
const resetSearch = () => {
  resetQuery()
  if (isMulti.value) inputText.value = ''
}
// Reka отдаёт новое значение модели (ключи): для single — значение, для multiple — массив.
const onModel = (k: unknown) => {
  set(isMulti.value ? ((k as unknown[] | null | undefined) ?? []).map(fromKey) : k === null || k === undefined ? null : fromKey(k))
  resetSearch()
  // single: Reka закрывает список и возвращает в поле подпись (displayValue).
  if (!isMulti.value) pristine.value = true
}
const onOpen = (v: boolean) => {
  open.value = v
  resetQuery()
  // При закрытии Reka возвращает в поле подпись (resetSearchTermOnBlur).
  if (!v) pristine.value = true
}

const inputCmp = ref<ComponentPublicInstance>()
const inputEl = () => inputCmp.value?.$el as HTMLInputElement | undefined
// single с поиском: подпись выбранного остаётся значением поля (скринридер читает выбранное), в фокусе
// выделена; любая правка (символ, Backspace/Delete, вставка, IME, автозамена) заменяет её целиком,
// а не дописывается к ней. beforeinput ловит все виды правок, в том числе без keydown.
const labelShown = () => searchable.value && !isMulti.value && !!displayText.value && pristine.value
const clearLabel = () => {
  inputText.value = ''
  const el = inputEl()
  if (el) el.value = ''
}
// pristine на фокусе не ставим: фокус текст не меняет, а Reka при открытии зовёт input.focus() —
// лишнее событие посреди набора вернуло бы флаг и стёрло набранное.
const onFocus = (e: FocusEvent) => {
  if (labelShown()) inputEl()?.select()
  emit('focus', e)
}
const onBeforeInput = (e: Event) => {
  if (!labelShown()) return
  pristine.value = false
  // IME: value во время композиции не трогаем — выделенную (на фокусе) подпись заменит сама композиция.
  const ie = e as InputEvent
  if (ie.isComposing || ie.inputType === 'insertCompositionText') return
  clearLabel()
}

const contentCmp = ref<ComponentPublicInstance>()
const onBlur = (e: FocusEvent) => {
  // Фокус ушёл в сам список (на всякий случай: mousedown там отменён) — это не уход из поля.
  const to = e.relatedTarget as Node | null
  if (to && (contentCmp.value?.$el as HTMLElement | undefined)?.contains(to)) return
  if (!isMulti.value) {
    resetQuery()
    inputText.value = displayText.value
    pristine.value = true
  }
  emit('blur', e)
}
// compositionend и следующий за ним input несут тот же текст — search шлём один раз.
const applyQuery = (e: Event) => {
  const text = (e.target as HTMLInputElement).value
  if (text === query.value) return
  query.value = text
  emit('search', text)
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

// Клик по пустому месту рамки (между метками, справа от текста) — как по полю.
const onAnchorClick = (e: MouseEvent) => {
  if (props.disabled || e.target !== e.currentTarget) return
  inputEl()?.focus()
  inputEl()?.click()
}
defineExpose({ focus: () => inputEl()?.focus(), blur: () => inputEl()?.blur() })
const popupStyle = computed(() => (props.popupWidth === undefined ? undefined
  : { minWidth: typeof props.popupWidth === 'number' ? `${props.popupWidth}px` : props.popupWidth }))
// Поле без своей рамки (рамка — fieldShell): шрифт и цвет наследуются; без поиска — без каретки.
const inputClass = computed(() => cn(
  'min-w-[4ch] flex-1 border-0 bg-transparent p-0 font-sans [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted',
  !searchable.value && 'cursor-pointer caret-transparent',
  props.disabled && 'cursor-not-allowed placeholder:text-ink-3',
))
</script>

<template>
  <ComboboxRoot
    :open="open"
    :model-value="rekaModel"
    :multiple="isMulti"
    :disabled="disabled"
    ignore-filter
    open-on-click
    :style="attrs.style as StyleValue"
    :class="cn('inline-flex w-full min-w-0', attrs.class as ClassValue)"
    @update:open="onOpen"
    @update:model-value="onModel"
  >
    <ComboboxAnchor
      :class="cn(fieldShell({ size, invalid: isInvalid, disabled, multiline: isMulti }), 'pr-1.5', !disabled && 'cursor-pointer')"
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
        :placeholder="selected.length ? undefined : placeholder"
        :aria-invalid="isInvalid || undefined"
        :class="inputClass"
        @update:model-value="inputText = $event"
        @input="onInput"
        @compositionend="applyQuery"
        @beforeinput="onBeforeInput"
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
        @mousedown.prevent
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
        :style="popupStyle"
        :class="cn(floatingSurface, 'w-(--reka-combobox-trigger-width) min-w-48 max-h-72 overflow-hidden')"
        @mousedown.prevent
      >
        <ComboboxViewport class="max-h-70 overflow-y-auto">
          <ComboboxEmpty class="px-2.5 py-2 text-sm text-ink-3">{{ loading ? t('common.loading') : (notFoundContent ?? t('z.noResults')) }}</ComboboxEmpty>
          <ComboboxItem
            v-for="o in listOptions"
            :key="o.value"
            :value="toKey(o.value)"
            :text-value="o.label"
            :disabled="o.disabled"
            :title="o.label"
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
