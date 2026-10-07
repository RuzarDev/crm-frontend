<script setup lang="ts">
import { computed, ref, useAttrs, useId, watch, type ComponentPublicInstance, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AutocompleteAnchor, AutocompleteContent, AutocompleteInput, AutocompleteItem, AutocompletePortal,
  AutocompleteRoot, AutocompleteViewport,
} from 'reka-ui'
import { PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fieldShell, floatingSurface, listItem } from '@/ui/surfaces'
import { filterOptions, toKey, type ZFilterOption, type ZOption, type ZOptionValue } from '@/ui/options'
import { useFieldControl } from '@/ui/form'

// Замена a-auto-complete (21 место): значение — набранный текст, опции — только подсказки.
// Reka Autocomplete (а не Combobox): у него модель — сам текст поля, ввод и IME (отложенный ввод до
// compositionend) он ведёт сам; у Combobox модель — выбранный пункт, а текст — отдельная подпись.
// Подсказки фильтрует наш filterOptions (ignore-filter у Reka). Выбор пункта перехватываем (preventDefault):
// значение — String(option.value) (Reka не берёт '' значением пункта — там служебный ключ), плюс select.
// class/style — на корневой DOM-элемент (AutocompleteRoot, база inline-flex w-full min-w-0; рамка внутри — w-full),
// остальные $attrs (aria-*, data-*, слушатели) — на <input>, как у ZInput.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = withDefaults(defineProps<{
  value?: string | null
  options: ZOption[]
  /** Как :filter-option у a-select (true — по подписи без учёта регистра, false — без фильтра, функция — своя).
   *  У a-auto-complete по умолчанию false; у нас true — справочники в сотни кодов без фильтра бесполезны. */
  filterOption?: ZFilterOption
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  invalid?: boolean
  allowClear?: boolean
  /** Моноширинный ввод — коды, номера. */
  mono?: boolean
  /** Минимальная ширина окна подсказок (число — px, строка — как есть, '420px', '30rem'); по умолчанию —
   *  ширина поля. Для подсказок в две строки (реестры СВХ, ТРОИС), где поле узкое. */
  popupWidth?: number | string
}>(), { value: '', size: 'md', filterOption: true })

const emit = defineEmits<{
  'update:value': [value: string]
  /** На каждый ввод и выбор подсказки, как у a-auto-complete. */
  change: [value: string]
  search: [text: string]
  select: [value: ZOptionValue, option: ZOption]
}>()

const { t } = useI18n()
// Текст ведём сами (из value): старые экраны не всегда связывают v-model — поле не должно откатываться.
const text = ref(props.value ?? '')
watch(() => props.value, (v) => { text.value = v ?? '' })
const suggestions = computed(() => filterOptions(props.options, text.value, props.filterOption))
// Подсказок нет — окна нет (aria-expanded=false); появились (дозагрузились) — показываем.
const open = ref(false)
const shown = computed(() => open.value && suggestions.value.length > 0)

const commit = (next: string) => {
  if (next === text.value) return
  text.value = next
  emit('update:value', next)
  emit('change', next)
  notifyChange()
}
// Reka шлёт сюда только набор (выбор пункта перехвачен в pick). Повтор того же текста (compositionend
// после обычного input на Android) — без дублей.
const onType = (next: string) => {
  if (next === text.value) return
  commit(next)
  emit('search', next)
}
const pick = (e: Event, o: ZOption) => {
  e.preventDefault()
  open.value = false
  commit(String(o.value))
  emit('select', o.value, o)
}

const inputCmp = ref<ComponentPublicInstance>()
const inputEl = () => inputCmp.value?.$el as HTMLInputElement | undefined
// Внутри ZField: id/aria-* поля, красная рамка при ошибке, change/blur — полю (см. src/ui/form.ts).
// Своего prop id нет: id приходит атрибутом (на <input>) и важнее id поля.
const { fieldId, fieldDescribedBy, fieldInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, focus: () => inputEl()?.focus(), value: () => text.value,
})
const isInvalid = computed(() => props.invalid || fieldInvalid.value)
const contentCmp = ref<ComponentPublicInstance>()
// Связь поля и списка для скринридера. Reka Autocomplete даёт полю пустой aria-controls до первого открытия
// и ставит id списку изнутри (атрибутом не перебить), поэтому id свой и стабильный: aria-controls — на поле
// (наш атрибут сливается последним), id — элементу списка при каждом его монтировании.
const listId = `z-combobox-${useId()}`
// Экземпляр ComboboxContent переживает закрытие (внутри монтируется заново) — сверяем на каждом открытии.
watch([shown, contentCmp], () => {
  const el = contentCmp.value?.$el as Element | undefined
  const list = el?.closest?.('[role="listbox"]') ?? el?.querySelector?.('[role="listbox"]')
  if (list) list.id = listId
}, { flush: 'post' })
const popupStyle = computed(() => (props.popupWidth === undefined ? undefined
  : { minWidth: typeof props.popupWidth === 'number' ? `${props.popupWidth}px` : props.popupWidth }))
// Пустой список Reka не рендерит, и его «клик снаружи» не сработает: закрываем на уходе фокуса сами,
// иначе подсказки, пришедшие позже, открыли бы окно у поля без фокуса.
const onBlur = (e: FocusEvent) => {
  const to = e.relatedTarget as Node | null
  if (to && (contentCmp.value?.$el as HTMLElement | undefined)?.contains(to)) return
  open.value = false
  notifyBlur()
}
const clear = () => {
  commit('')
  inputEl()?.focus()
}
defineExpose({ focus: () => inputEl()?.focus(), blur: () => inputEl()?.blur() })
</script>

<template>
  <AutocompleteRoot
    :model-value="text"
    :open="shown"
    :disabled="disabled"
    ignore-filter
    open-on-click
    :style="attrs.style as StyleValue"
    :class="cn('inline-flex w-full min-w-0', attrs.class as ClassValue)"
    @update:model-value="onType"
    @update:open="open = $event"
  >
    <AutocompleteAnchor :class="fieldShell({ size, invalid: isInvalid, disabled })">
      <AutocompleteInput
        v-bind="inputAttrs"
        ref="inputCmp"
        :id="fieldId"
        :aria-controls="listId"
        :placeholder="placeholder"
        :aria-invalid="isInvalid || undefined"
        :aria-describedby="fieldDescribedBy"
        :aria-required="fieldRequired"
        :class="cn(
          'min-w-0 flex-1 border-0 bg-transparent p-0 [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted disabled:cursor-not-allowed disabled:placeholder:text-ink-3',
          mono ? 'font-mono tabular-nums' : 'font-sans',
        )"
        @blur="onBlur"
      />
      <button
        v-if="allowClear && text && !disabled"
        type="button"
        :aria-label="t('common.clear')"
        class="-mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus"
        @mousedown.prevent
        @click.stop="clear"
      >
        <PhX :size="12" weight="bold" />
      </button>
    </AutocompleteAnchor>
    <AutocompletePortal>
      <AutocompleteContent
        ref="contentCmp"
        position="popper"
        :side-offset="4"
        :style="popupStyle"
        :class="cn(floatingSurface, 'w-(--reka-combobox-trigger-width) min-w-48 max-h-72 overflow-hidden')"
        @mousedown.prevent
      >
        <AutocompleteViewport class="max-h-70 overflow-y-auto">
          <AutocompleteItem
            v-for="o in suggestions"
            :key="o.value"
            :value="toKey(o.value)"
            :text-value="o.label"
            :disabled="o.disabled"
            :class="listItem"
            @select="pick($event, o)"
          >
            <slot name="option" v-bind="o"><span class="min-w-0 flex-1 truncate">{{ o.label }}</span></slot>
          </AutocompleteItem>
        </AutocompleteViewport>
      </AutocompleteContent>
    </AutocompletePortal>
  </AutocompleteRoot>
</template>
