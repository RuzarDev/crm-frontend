<script setup lang="ts">
import { computed, nextTick, ref, useAttrs, useId, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { fromCalendarDate, toCalendarDate } from '@/ui/date'
import { useFieldControl } from '@/ui/form'
import ZDate from './ZDate.vue'

// Замена a-range-picker (3 места: реестр, финансы, реестр заявок): два ZDate «С — По» в одной строке
// (на ≤640px — в столбик) с разделителем «—». Значение — [от, до], каждый конец 'YYYY-MM-DD' | null.
// update:value + change — один раз на каждую зафиксированную правку любого конца (фиксирует сам ZDate:
// Enter, уход из поля, выбор в календаре, очистка). «По» раньше «с» (или «с» позже «по») — пара
// меняется местами при фиксации, как у a-range-picker. Очистка одного конца — [null, до] / [от, null].
// ZField: подпись и id — у «с» (поле занимает ZDateRange, а не ZDate), aria-describedby/invalid/required — у обоих.
// Имена полей для экранного доступа: скрытые «С»/«По»; aria-labelledby = подпись ZField (если есть) + «С»/«По»
// («Период С»). class/style и остальные $attrs (aria-label, data-*…) — на группу (role="group"); id и
// aria-describedby/invalid/required — на поля. onFocus/onBlur из $attrs — по смыслу группы: focus — фокус вошёл
// в группу снаружи, blur — ушёл из группы (на второй конец и в свои окна календарей не считается).
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const groupAttrs = computed(() => {
  const { class: _c, style: _s, id: _id, 'aria-describedby': _d, 'aria-invalid': _i, 'aria-required': _r, onFocus: _f, onBlur: _b, ...rest } = attrs
  return rest
})

type Pair = [string | null, string | null]

const props = withDefaults(defineProps<{
  value?: Pair | null
  min?: string | null
  max?: string | null
  /** [подсказка «с», подсказка «по»]. */
  placeholder?: [string, string]
  size?: 'sm' | 'md'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  allowClear?: boolean
  id?: string
}>(), { value: null, size: 'md' })

const emit = defineEmits<{
  'update:value': [value: Pair]
  change: [value: Pair]
}>()

const { t } = useI18n()
const fromEl = ref<InstanceType<typeof ZDate>>()
const toEl = ref<InstanceType<typeof ZDate>>()
const rootEl = ref<HTMLElement>()

const { fieldId, fieldLabelId, fieldDescribedBy, fieldInvalid, fieldAriaInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, invalid: () => !!props.invalid, id: () => props.id, focus: () => fromEl.value?.focus(), value: () => props.value ?? [null, null],
})

// 'YYYY-MM-DDT00:00:00' → 'YYYY-MM-DD': хвост времени не даёт ложной перестановки.
const norm = (x: string | null | undefined) => fromCalendarDate(toCalendarDate(x))
const from = computed(() => norm(props.value?.[0]))
const to = computed(() => norm(props.value?.[1]))
const uid = useId()
const fromNameId = `${uid}-from`
const toNameId = `${uid}-to`
const labelledBy = (own: string) => [fieldLabelId.value, own].filter(Boolean).join(' ')
// Перестановка: «от» ZDate после фиксации показывает набранное, а родитель вернул другое (и оно могло совпасть
// с прежним значением — тогда prop не менялся бы). Пока родитель обновляет значение, поле держит набранное,
// затем переходит на итог — ZDate видит смену значения и перерисовывает текст.
const fromOverride = ref<string | null | undefined>(undefined)
const toOverride = ref<string | null | undefined>(undefined)
const fromShown = computed(() => (fromOverride.value !== undefined ? fromOverride.value : from.value))
const toShown = computed(() => (toOverride.value !== undefined ? toOverride.value : to.value))

const commit = (next: Pair) => {
  emit('update:value', next)
  emit('change', next)
  notifyChange()
}
const onFrom = async (v: string | null) => {
  const other = to.value
  if (v && other && v > other) {
    fromOverride.value = v
    commit([other, v])
    await nextTick()
    fromOverride.value = undefined
  } else commit([v, other])
}
const onTo = async (v: string | null) => {
  const other = from.value
  if (v && other && v < other) {
    toOverride.value = v
    commit([v, other])
    await nextTick()
    toOverride.value = undefined
  } else commit([other, v])
}

// Внутри группы — сама группа и окна календарей этих двух полей (по aria-controls кнопки; окна — в портале).
const inGroup = (n: Node | null) => {
  if (!n) return false
  if (rootEl.value?.contains(n)) return true
  const ids = [...(rootEl.value?.querySelectorAll('[aria-haspopup="dialog"]') ?? [])].map((b) => b.getAttribute('aria-controls'))
  return ids.some((id) => !!id && !!document.getElementById(id)?.contains(n))
}
const callAttr = (name: 'onFocus' | 'onBlur', e: Event) => {
  const h = attrs[name]
  for (const fn of Array.isArray(h) ? h : [h]) if (typeof fn === 'function') fn(e)
}
const onFocusIn = (e: FocusEvent) => {
  if (!inGroup(e.relatedTarget as Node | null)) callAttr('onFocus', e)
}
// Уход фокуса из группы — blur полю и onBlur.
const onFocusOut = (e: FocusEvent) => {
  const next = e.relatedTarget as Node | null
  if (inGroup(next)) return
  if (!next && !document.hasFocus()) return
  notifyBlur()
  callAttr('onBlur', e)
}

defineExpose({ focus: () => fromEl.value?.focus(), blur: () => { fromEl.value?.blur(); toEl.value?.blur() } })

// В столбик (телефон) flex-1 схлопнул бы высоту — там строки по ширине, высота своя.
const dateClass = 'sm:min-w-[8.5rem] sm:flex-1 max-sm:w-full max-sm:flex-none'
</script>

<template>
  <div
    v-bind="groupAttrs"
    ref="rootEl"
    role="group"
    :style="attrs.style as StyleValue"
    :class="cn('flex w-full items-center gap-2 max-sm:flex-col max-sm:items-stretch', attrs.class as ClassValue)"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <span :id="fromNameId" class="sr-only">{{ t('z.dateFrom') }}</span>
    <span :id="toNameId" class="sr-only">{{ t('z.dateTo') }}</span>
    <ZDate
      ref="fromEl"
      :id="fieldId"
      :value="fromShown"
      :min="min"
      :max="max"
      :placeholder="placeholder?.[0]"
      :size="size"
      :disabled="disabled"
      :readonly="readonly"
      :invalid="invalid || fieldInvalid"
      :allow-clear="allowClear"
      :aria-labelledby="labelledBy(fromNameId)"
      :aria-describedby="fieldDescribedBy"
      :aria-invalid="fieldAriaInvalid"
      :aria-required="fieldRequired"
      :class="dateClass"
      @change="onFrom"
    />
    <span aria-hidden="true" class="shrink-0 text-muted max-sm:hidden">—</span>
    <ZDate
      ref="toEl"
      :value="toShown"
      :min="min"
      :max="max"
      :placeholder="placeholder?.[1]"
      :size="size"
      :disabled="disabled"
      :readonly="readonly"
      :invalid="invalid || fieldInvalid"
      :allow-clear="allowClear"
      :aria-labelledby="labelledBy(toNameId)"
      :aria-describedby="fieldDescribedBy"
      :aria-invalid="fieldAriaInvalid"
      :aria-required="fieldRequired"
      :class="dateClass"
      @change="onTo"
    />
  </div>
</template>
