<script setup lang="ts">
import { computed, nextTick, ref, useAttrs, type ComponentPublicInstance, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DatePickerAnchor, DatePickerCalendar, DatePickerCell, DatePickerCellTrigger, DatePickerContent, DatePickerField,
  DatePickerGrid, DatePickerGridBody, DatePickerGridHead, DatePickerGridRow, DatePickerHeadCell, DatePickerHeader,
  DatePickerHeading, DatePickerInput, DatePickerNext, DatePickerPrev, DatePickerRoot, DatePickerTrigger,
} from 'reka-ui'
import type { DateValue } from '@internationalized/date'
import { PhCalendarBlank, PhCaretLeft, PhCaretRight, PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fieldShell, floatingSurface } from '@/ui/surfaces'
import { calendarLocale, fromCalendarDate, toCalendarDate } from '@/ui/date'

// Замена a-date-picker с value-format="YYYY-MM-DD" format="DD.MM.YYYY" (30 мест, в основном форма ДТ).
// Ввод сегментами ДД.ММ.ГГГГ (Reka DateField): цифры сами переходят к следующему сегменту, Tab — между
// сегментами, ArrowUp/Down — меняют сегмент, Alt+ArrowDown или кнопка — календарь, Escape — закрыть.
// Значение — строка 'YYYY-MM-DD' | null. change — один раз на настоящее изменение:
//  - набор цифр копится, пока сегмент не дописан; значение фиксируется, когда фокус уходит из сегмента
//    (сам Reka переводит его дальше, Tab, клик мимо), по Enter и стрелкам — сразу;
//  - неполная дата (пустой сегмент, год < 1000 — «26» вместо «2026»), дата вне min/max — не значение;
//    уход из поля с такой датой возвращает прежнее значение (как a-date-picker с неверным текстом);
//  - все сегменты стёрты — null; выбор в календаре и кнопка очистки — сразу.
// class/style — на рамку (она же группа поля), остальные $attrs (aria-label, aria-describedby, data-*) —
// туда же: у DateField группа role="group" и есть то, что подписывают.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const fieldAttrs = computed(() => {
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
// null, а не undefined: у Reka undefined делает модель неуправляемой (своё внутреннее состояние).
const model = computed(() => toCalendarDate(props.value) ?? null)
const minDate = computed(() => toCalendarDate(props.min))
const maxDate = computed(() => toCalendarDate(props.max))
const current = computed(() => fromCalendarDate(model.value))

const open = ref(false)
// Перемонтирование поля — единственный способ вернуть сегменты к значению: Reka синхронизирует их
// только при смене модели.
const fieldKey = ref(0)
const fieldCmp = ref<ComponentPublicInstance>()
const fieldEl = () => fieldCmp.value?.$el as HTMLElement | undefined
// Окно календаря — в портале ($el у DatePickerContent — заглушка телепорта); находим по aria-controls кнопки.
const contentEl = () => {
  const id = fieldEl()?.querySelector('[data-reka-date-field-segment="trigger"]')?.getAttribute('aria-controls')
  return id ? document.getElementById(id) : null
}
const editable = (el: ParentNode | undefined) =>
  [...(el?.querySelectorAll<HTMLElement>('[data-reka-date-field-segment]:is([data-reka-date-field-segment="day"],[data-reka-date-field-segment="month"],[data-reka-date-field-segment="year"])') ?? [])]

// Последняя полная дата из сегментов, ещё не зафиксированная (undefined — нечего фиксировать).
let pending: string | undefined
// Набрана полная дата вне min/max — красная рамка, пока не исправят или не уйдут из поля.
const outOfRange = ref(false)
const isInvalid = computed(() => props.invalid || outOfRange.value)
const commit = (next: string | null) => {
  pending = undefined
  outOfRange.value = false
  if (next === current.value) return
  emit('update:value', next)
  emit('change', next)
}
const inRange = (d: DateValue) =>
  d.year >= 1000 && (!minDate.value || d.compare(minDate.value) >= 0) && (!maxDate.value || d.compare(maxDate.value) <= 0)

const allEmpty = () => editable(fieldEl()).every((s) => s.hasAttribute('data-placeholder'))
const flush = () => { if (pending !== undefined) commit(pending) }

const onModel = (d: DateValue | undefined) => {
  // «Нет даты» — стёрт сегмент: null, только если стёрты все (это смотрит onKeydown).
  if (!d) {
    pending = undefined
    outOfRange.value = false
    return
  }
  pending = inRange(d) ? fromCalendarDate(d)! : undefined
  outOfRange.value = d.year >= 1000 && pending === undefined
  // В календаре выбор окончательный: фиксируем и закрываем.
  if (open.value) {
    flush()
    open.value = false
  }
}

// Сегменты совпадают со значением (иначе на уходе из поля — откат к значению).
const segmentsMatch = () => {
  const segs = editable(fieldEl())
  const d = model.value
  if (!d) return segs.every((s) => s.hasAttribute('data-placeholder'))
  const want: Record<string, number> = { day: d.day, month: d.month, year: d.year }
  return segs.every((s) => !s.hasAttribute('data-placeholder') && Number(s.textContent) === want[s.dataset.rekaDateFieldSegment!])
}
const onFocusOut = (e: FocusEvent) => {
  flush()
  const to = e.relatedTarget as Node | null
  if (to && (fieldEl()?.contains(to) || contentEl()?.contains(to))) return
  // Фиксация выше могла поменять значение — сверяем после того, как Reka обновит сегменты.
  nextTick(() => {
    if (segmentsMatch()) return
    outOfRange.value = false
    fieldKey.value++
  })
}
// Перехват до сегмента: Alt+ArrowDown у сегмента уменьшил бы число.
const onKeydownCapture = (e: KeyboardEvent) => {
  if (e.altKey && e.key === 'ArrowDown' && !props.disabled && !props.readonly) {
    e.preventDefault()
    e.stopPropagation()
    open.value = true
  }
}
// После обработчика сегмента (всплытие): стрелки и Enter фиксируют сразу; дописанный сегмент — тоже.
// Reka переводит фокус дальше раньше, чем обновляет дату, поэтому focusout для этого поздно.
const onKeydown = (e: KeyboardEvent) => {
  if (e.isComposing) return
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || document.activeElement !== e.target) flush()
  // Сегмент Reka уже очистил, но ещё не перерисовал — сверяем после отрисовки.
  if (e.key === 'Backspace' || e.key === 'Delete') nextTick(() => { if (allEmpty()) commit(null) })
}

const focus = () => editable(fieldEl())[0]?.focus()
const clear = async () => {
  commit(null)
  fieldKey.value++
  await nextTick()
  focus()
}
defineExpose({ focus, blur: () => (document.activeElement as HTMLElement | null)?.blur() })

const segmentLabel: Record<string, string> = { day: 'z.dateDay', month: 'z.dateMonth', year: 'z.dateYear' }
const showPlaceholder = computed(() => !!props.placeholder && !model.value)
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
    :id="id"
    v-model:open="open"
    :name="name"
    :model-value="model"
    :min-value="minDate"
    :max-value="maxDate"
    :locale="rekaLocale"
    :disabled="disabled"
    :readonly="readonly"
    granularity="day"
    :week-starts-on="1"
    weekday-format="short"
    prevent-deselect
    @update:model-value="onModel"
  >
    <DatePickerAnchor as-child>
      <DatePickerField
        :key="fieldKey"
        v-slot="{ segments }"
        ref="fieldCmp"
        v-bind="fieldAttrs"
        :aria-invalid="isInvalid || undefined"
        :style="attrs.style as StyleValue"
        :class="cn(
          fieldShell({ size, invalid: isInvalid, disabled }),
          'group/zdate relative pr-1.5',
          readonly && !disabled && 'bg-sunken',
          attrs.class as ClassValue,
        )"
        @keydown.capture="onKeydownCapture"
        @keydown="onKeydown"
        @focusout="onFocusOut"
      >
        <span :class="cn('flex min-w-0 items-center', showPlaceholder && 'opacity-0 group-focus-within/zdate:opacity-100')">
          <template v-for="seg in segments" :key="seg.part">
            <DatePickerInput v-if="seg.part === 'literal'" :part="seg.part" class="text-muted">{{ seg.value }}</DatePickerInput>
            <DatePickerInput
              v-else
              :part="seg.part"
              :aria-label="segmentLabel[seg.part] ? t(segmentLabel[seg.part]) : undefined"
              :class="cn(
                'rounded-[4px] px-0.5 tabular-nums outline-hidden focus:bg-zircon-soft focus:text-ink data-[placeholder]:text-muted',
                disabled && 'data-[placeholder]:text-ink-3',
              )"
            >{{ seg.value }}</DatePickerInput>
          </template>
        </span>
        <span
          v-if="showPlaceholder"
          :class="cn('pointer-events-none absolute inset-y-0 left-3 right-14 flex items-center truncate text-muted group-focus-within/zdate:hidden', disabled && 'text-ink-3')"
        >{{ placeholder }}</span>
        <span class="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            v-if="allowClear && value && !disabled && !readonly"
            type="button"
            :aria-label="t('common.clear')"
            :class="iconButton"
            @mousedown.prevent
            @click.stop="clear"
          >
            <PhX :size="12" weight="bold" />
          </button>
          <DatePickerTrigger :aria-label="t('z.chooseDate')" :class="iconButton" :disabled="disabled || readonly">
            <PhCalendarBlank :size="14" />
          </DatePickerTrigger>
        </span>
      </DatePickerField>
    </DatePickerAnchor>
    <DatePickerContent
      align="start"
      :side-offset="4"
      :collision-padding="8"
      :class="cn(floatingSurface, 'p-3')"
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
                <DatePickerCellTrigger :day="day" :month="month.value" :class="cellClass" />
              </DatePickerCell>
            </DatePickerGridRow>
          </DatePickerGridBody>
        </DatePickerGrid>
      </DatePickerCalendar>
    </DatePickerContent>
  </DatePickerRoot>
</template>
