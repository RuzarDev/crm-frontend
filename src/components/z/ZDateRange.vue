<script setup lang="ts">
import { computed, nextTick, ref, useAttrs, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { useFieldControl } from '@/ui/form'
import ZDate from './ZDate.vue'

// Замена a-range-picker (3 места: реестр, финансы, реестр заявок): два ZDate «С — По» в одной строке
// (на ≤640px — в столбик) с разделителем «—». Значение — [от, до], каждый конец 'YYYY-MM-DD' | null.
// update:value + change — один раз на каждую зафиксированную правку любого конца (фиксирует сам ZDate:
// Enter, уход из поля, выбор в календаре, очистка). «По» раньше «с» (или «с» позже «по») — пара
// меняется местами при фиксации, как у a-range-picker. Очистка одного конца — [null, до] / [от, null].
// ZField: подпись и id — у «с» (поле занимает ZDateRange, а не ZDate), aria-describedby/invalid/required — у обоих.
// class/style и остальные $attrs (aria-label, data-*…) — на группу (role="group"); id и aria-describedby/
// invalid/required — на поля.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const groupAttrs = computed(() => {
  const { class: _c, style: _s, id: _id, 'aria-describedby': _d, 'aria-invalid': _i, 'aria-required': _r, ...rest } = attrs
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

const { fieldId, fieldDescribedBy, fieldInvalid, fieldAriaInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, invalid: () => !!props.invalid, id: () => props.id, focus: () => fromEl.value?.focus(), value: () => props.value ?? [null, null],
})

const from = computed(() => props.value?.[0] ?? null)
const to = computed(() => props.value?.[1] ?? null)
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

// Уход фокуса из группы (не на второй конец и не в окно календаря) — blur полю.
const onFocusOut = (e: FocusEvent) => {
  const next = e.relatedTarget as Element | null
  if (next && (rootEl.value?.contains(next) || next.closest('[role="dialog"]'))) return
  if (!next && !document.hasFocus()) return
  notifyBlur()
}

defineExpose({ focus: () => fromEl.value?.focus(), blur: () => { fromEl.value?.blur(); toEl.value?.blur() } })

const dateClass = 'min-w-[8.5rem] flex-1'
</script>

<template>
  <div
    v-bind="groupAttrs"
    ref="rootEl"
    role="group"
    :style="attrs.style as StyleValue"
    :class="cn('flex w-full items-center gap-2 max-sm:flex-col max-sm:items-stretch', attrs.class as ClassValue)"
    @focusout="onFocusOut"
  >
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
      :aria-label="t('z.dateFrom')"
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
      :aria-label="t('z.dateTo')"
      :aria-describedby="fieldDescribedBy"
      :aria-invalid="fieldAriaInvalid"
      :aria-required="fieldRequired"
      :class="dateClass"
      @change="onTo"
    />
  </div>
</template>
