<script setup lang="ts">
import { computed, nextTick, ref, useAttrs, watch, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DatePickerAnchor, DatePickerCalendar, DatePickerCell, DatePickerCellTrigger, DatePickerContent, DatePickerGrid,
  DatePickerGridBody, DatePickerGridHead, DatePickerGridRow, DatePickerHeadCell, DatePickerHeader, DatePickerHeading,
  DatePickerNext, DatePickerPrev, DatePickerRoot, DatePickerTrigger,
} from 'reka-ui'
import type { DateValue } from '@internationalized/date'
import { PhCalendarBlank, PhCaretLeft, PhCaretRight, PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fieldShell, floatingSurface } from '@/ui/surfaces'
import {
  calendarLocale, formatDateText, fromCalendarDate, isCompleteDateText, maskDateText, parseDateText, textOf, toCalendarDate,
} from '@/ui/date'
import { useFieldControl } from '@/ui/form'

// Замена a-date-picker с value-format="YYYY-MM-DD" format="DD.MM.YYYY" (30 мест, в основном форма ДТ).
// Поле — обычный <input> с маской ДД.ММ.ГГГГ (точки ставятся сами, вставка 28/09/2026, 2026-09-28,
// двузначный год) + кнопка календаря (Reka DatePicker: только окно с календарём, без сегментов —
// сегменты Reka обрезали день по показанному месяцу и фиксировали каждую цифру).
// Значение — 'YYYY-MM-DD' | null. Пока набирают — событий нет. Фиксация (update:value + change один раз,
// если дата отличается от value): Enter; уход из поля (фокус не в поле и не в календаре, окно браузера
// в фокусе — alt-tab черновик не трогает); выбор в календаре; кнопка очистки. Пустой текст — null.
// Неполная/несуществующая/вне min/max дата на уходе откатывается к значению (как у a-date-picker),
// пока черновик не откачен — красная рамка и aria-invalid (для набранной полностью). Escape — откат черновика;
// пока черновик есть, у <input> атрибут data-z-draft — по нему ZModal/ZDrawer не закрываются этим Escape.
// class/style — на рамку, остальные $attrs (aria-*, data-*, onFocus/onBlur…) — на <input>, как у ZInput.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = withDefaults(defineProps<{
  value?: string | null
  /** Нижняя граница, 'YYYY-MM-DD'. */
  min?: string | null
  /** Верхняя граница, 'YYYY-MM-DD'. */
  max?: string | null
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  allowClear?: boolean
  id?: string
  name?: string
}>(), { value: null, size: 'md' })

const emit = defineEmits<{
  'update:value': [value: string | null]
  change: [value: string | null]
}>()

const { t, locale } = useI18n()
const rekaLocale = computed(() => calendarLocale(locale.value))
const minDate = computed(() => toCalendarDate(props.min))
const maxDate = computed(() => toCalendarDate(props.max))
// Значение в нормальном виде ('2026-09-28T00:00:00' → '2026-09-28') — для сравнения при фиксации.
const current = computed(() => fromCalendarDate(toCalendarDate(props.value)))
const inRange = (d: DateValue) => (!minDate.value || d.compare(minDate.value) >= 0) && (!maxDate.value || d.compare(maxDate.value) <= 0)

const inputEl = ref<HTMLInputElement>()
const wrapEl = ref<HTMLElement>()
// Внутри ZField: id/aria-* поля, красная рамка при ошибке; change — на фиксации, blur — на уходе из поля
// (не в календарь) — полю (см. src/ui/form.ts).
const { fieldId, fieldDescribedBy, fieldInvalid, fieldAriaInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, invalid: () => !!props.invalid || draftInvalid.value, id: () => props.id, focus: () => inputEl.value?.focus(), value: () => props.value,
})
const text = ref(formatDateText(props.value))
// Пользователь правил текст с последней синхронизации со значением (черновик).
const dirty = ref(false)
const open = ref(false)

const showValue = () => {
  text.value = formatDateText(props.value)
  dirty.value = false
}
// Родитель сменил значение: без черновика — показываем; черновик не трогаем (фиксация сравнит с новым).
watch(() => props.value, () => { if (!dirty.value) showValue() })

const parsed = computed(() => parseDateText(text.value))
const draftValid = computed(() => parsed.value === null || (parsed.value !== undefined && inRange(parsed.value)))
// Красная рамка — у набранной полностью даты, пока черновик не зафиксирован или не откачен (на уходе
// из поля его откатывают — значит, пока фокус где-то в поле или в календаре). Двузначный год — только
// несуществующая дата: вне min/max «15.09.20» на пути к «2026» не мигает.
const draftInvalid = computed(() => {
  if (!dirty.value) return false
  if (isCompleteDateText(text.value)) return !draftValid.value
  return /^\d{1,2}\.\d{1,2}\.\d{2}$/.test(text.value.trim()) && parsed.value === undefined
})
const isInvalid = computed(() => props.invalid || draftInvalid.value || fieldInvalid.value)
// Календарь показывает набранную дату, если она верна, иначе значение.
const calendarModel = computed(() => (parsed.value && draftValid.value ? parsed.value : toCalendarDate(props.value) ?? null))

const set = (next: string | null) => {
  text.value = formatDateText(next)
  dirty.value = false
  if (next === current.value) return
  emit('update:value', next)
  emit('change', next)
  notifyChange()
}
// leave — уход из поля: неверный черновик откатывается; enter — остаётся (человек ещё в поле).
const commit = (mode: 'enter' | 'leave') => {
  if (!dirty.value) return
  const d = parsed.value
  if (d === null) set(null)
  else if (d !== undefined && inRange(d)) set(fromCalendarDate(d))
  else if (mode === 'leave') showValue()
}

// Окно календаря — в портале; находим по aria-controls кнопки.
const contentEl = () => {
  const id = wrapEl.value?.querySelector('[aria-haspopup="dialog"]')?.getAttribute('aria-controls')
  return id ? document.getElementById(id) : null
}
const inField = (n: Node | null) => !!n && (!!wrapEl.value?.contains(n) || !!contentEl()?.contains(n))
const onFocusOut = (e: FocusEvent) => {
  const to = e.relatedTarget as Node | null
  if (inField(to)) return
  // Фокус ушёл никуда, и окно браузера не в фокусе (alt-tab) — черновик остаётся как есть.
  if (!to && !document.hasFocus()) return
  commit('leave')
  notifyBlur()
}

// Каретка после маски: столько же цифр перед ней, сколько было в набранном.
const caretAfterDigits = (s: string, digits: number) => {
  if (digits <= 0) return 0
  let seen = 0
  for (let i = 0; i < s.length; i++) if (/\d/.test(s[i]) && ++seen === digits) return i + 1
  return s.length
}
const onInput = (e: Event) => {
  if ((e as InputEvent).isComposing) return
  const el = e.target as HTMLInputElement
  const raw = el.value
  const masked = maskDateText(raw)
  dirty.value = true
  text.value = masked
  if (masked === raw) return
  const digitsBefore = raw.slice(0, el.selectionStart ?? raw.length).replace(/\D/g, '').length
  el.value = masked
  const pos = caretAfterDigits(masked, digitsBefore)
  el.setSelectionRange(pos, pos)
}
const setText = (next: string) => {
  text.value = next
  dirty.value = true
  if (inputEl.value) inputEl.value.value = next
}
const onKeydown = (e: KeyboardEvent) => {
  if (e.isComposing) return
  if (e.key === 'ArrowDown' && e.altKey) {
    e.preventDefault()
    if (!props.disabled && !props.readonly) open.value = true
    return
  }
  if (props.readonly) return
  if (e.key === 'Enter') commit('enter')
  else if (e.key === 'Escape' && !open.value && dirty.value) {
    // Откат черновика — Escape не должен заодно закрыть окно, в котором поле.
    e.stopPropagation()
    showValue()
  }
  else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && parsed.value) {
    e.preventDefault()
    setText(textOf(parsed.value.add({ days: e.key === 'ArrowUp' ? 1 : -1 })))
  } else if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    setText('')
  }
}

// Фокус в поле после выбора в календаре и Escape в нём; клик мимо — фокус не забираем.
let returnFocus = false
const onPick = (d: DateValue | undefined) => {
  // Окно уже закрыто этим же выбором (клик дошёл и до onSameDay).
  if (!d || !open.value) return
  set(fromCalendarDate(d))
  returnFocus = true
  open.value = false
}
// Уже выбранный день Reka не сообщает (prevent-deselect) — выбор того же дня тоже закрывает окно
// и фиксирует набранное.
const onSameDay = (day: DateValue) => {
  if (calendarModel.value && day.compare(calendarModel.value) === 0 && inRange(day)) onPick(day)
}
const onOpen = (v: boolean) => {
  open.value = v
  if (v || returnFocus) return
  // Закрыли кликом/фокусом мимо — это уход из поля.
  nextTick(() => {
    if (!document.hasFocus() || inField(document.activeElement)) return
    commit('leave')
    notifyBlur()
  })
}
const onCloseAutoFocus = (e: Event) => {
  e.preventDefault()
  if (returnFocus) inputEl.value?.focus()
  returnFocus = false
}

const clear = () => {
  set(null)
  inputEl.value?.focus()
}
defineExpose({ focus: () => inputEl.value?.focus(), blur: () => inputEl.value?.blur() })

const iconButton = 'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted'
const navButton = 'flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-ink-2 outline-hidden hover:bg-sunken focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45'
// Сегодня — полужирный цирконовый, выбранная — тёмно-синяя, вне месяца и вне min/max — бледные.
const cellClass = cn(
  'flex size-8 cursor-pointer select-none items-center justify-center rounded-[7px] text-sm tabular-nums text-ink outline-hidden',
  'transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:shadow-focus',
  'hover:not-data-[selected]:not-data-[disabled]:bg-sunken',
  'data-[today]:font-semibold data-[today]:not-data-[selected]:text-zircon-ink',
  'data-[outside-view]:text-faint',
  'data-[selected]:bg-navy data-[selected]:text-white',
  'data-[disabled]:cursor-not-allowed data-[disabled]:text-faint data-[unavailable]:text-faint',
)
</script>

<template>
  <DatePickerRoot
    :open="open"
    :model-value="calendarModel"
    :min-value="minDate"
    :max-value="maxDate"
    :locale="rekaLocale"
    :disabled="disabled"
    :readonly="readonly"
    granularity="day"
    :week-starts-on="1"
    weekday-format="short"
    prevent-deselect
    @update:open="onOpen"
    @update:model-value="onPick"
  >
    <DatePickerAnchor as-child>
      <span
        ref="wrapEl"
        :style="attrs.style as StyleValue"
        :class="cn(fieldShell({ size, invalid: isInvalid, disabled }), 'pr-1.5', readonly && !disabled && 'bg-sunken', attrs.class as ClassValue)"
        @focusout="onFocusOut"
      >
        <input
          v-bind="inputAttrs"
          :id="fieldId"
          ref="inputEl"
          :name="name"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :value="text"
          :placeholder="placeholder ?? t('z.datePlaceholder')"
          :disabled="disabled"
          :readonly="readonly"
          :aria-invalid="fieldAriaInvalid"
          :aria-describedby="fieldDescribedBy"
          :aria-required="fieldRequired"
          :data-z-draft="dirty || undefined"
          class="min-w-0 flex-1 border-0 bg-transparent p-0 font-sans tabular-nums [font-size:inherit] [line-height:inherit] [color:inherit] outline-hidden placeholder:text-muted disabled:cursor-not-allowed disabled:placeholder:text-ink-3"
          @input="onInput"
          @compositionend="onInput"
          @keydown="onKeydown"
        >
        <button
          v-if="allowClear && text && !disabled && !readonly"
          type="button"
          :aria-label="t('common.clear')"
          :class="iconButton"
          @mousedown.prevent
          @click.stop="clear"
        >
          <PhX :size="12" weight="bold" />
        </button>
        <!-- mousedown.prevent: Safari/Firefox не дают фокус кнопке по клику — фокус ушёл бы «никуда»,
             и черновик зафиксировался бы до открытия календаря. -->
        <DatePickerTrigger :aria-label="t('z.chooseDate')" :class="iconButton" :disabled="disabled || readonly" @mousedown.prevent>
          <PhCalendarBlank :size="14" />
        </DatePickerTrigger>
      </span>
    </DatePickerAnchor>
    <DatePickerContent
      align="start"
      :side-offset="4"
      :collision-padding="8"
      :class="cn(floatingSurface, 'p-3')"
      @escape-key-down="returnFocus = true"
      @close-auto-focus="onCloseAutoFocus"
    >
      <DatePickerCalendar v-slot="{ weekDays, grid }">
        <DatePickerHeader class="mb-2 flex items-center justify-between gap-2">
          <DatePickerPrev :aria-label="t('z.prevMonth')" :class="navButton"><PhCaretLeft :size="14" /></DatePickerPrev>
          <DatePickerHeading class="text-sm font-semibold text-ink first-letter:uppercase" />
          <DatePickerNext :aria-label="t('z.nextMonth')" :class="navButton"><PhCaretRight :size="14" /></DatePickerNext>
        </DatePickerHeader>
        <DatePickerGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse select-none">
          <DatePickerGridHead>
            <DatePickerGridRow class="flex">
              <DatePickerHeadCell v-for="day in weekDays" :key="day" class="w-8 pb-1 text-xs font-normal text-muted">{{ day }}</DatePickerHeadCell>
            </DatePickerGridRow>
          </DatePickerGridHead>
          <DatePickerGridBody>
            <DatePickerGridRow v-for="(week, i) in month.rows" :key="i" class="flex">
              <DatePickerCell v-for="day in week" :key="day.toString()" :date="day" class="p-0">
                <DatePickerCellTrigger
                  :day="day"
                  :month="month.value"
                  :class="cellClass"
                  @click="onSameDay(day)"
                  @keydown.enter="onSameDay(day)"
                  @keydown.space="onSameDay(day)"
                />
              </DatePickerCell>
            </DatePickerGridRow>
          </DatePickerGridBody>
        </DatePickerGrid>
      </DatePickerCalendar>
    </DatePickerContent>
  </DatePickerRoot>
</template>
