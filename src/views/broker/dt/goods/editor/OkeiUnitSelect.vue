<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { ensureOkeiUnits, okeiUnits, type OkeiUnit } from './okei'

// Выбор единицы ОКЕИ (классификатор ЕЭК 2016) — как окно «Единицы измерения» КЕДЕН: в списке код, кр. наименование
// и наименование, поиск по любому из трёх («кг», «166», «килограмм»). Значение — код ОКЕИ («166»), в поле «166 — КГ».
//   <OkeiUnitSelect v-model:value="row.unitCode" />                    — все единицы справочника
//   <OkeiUnitSelect v-model:value="x" :codes="['796', '166']" />       — только эти коды (порядок справочника)
// Код не из справочника (старые данные, справочник не загрузился) показывается как есть и остаётся выбранным.
// Атрибуты (data-*, aria-*) уходят на поле ввода ZSelect.
const props = withDefaults(defineProps<{
  value?: string | null
  /** Ограничить список этими кодами ОКЕИ. */
  codes?: readonly string[] | null
  disabled?: boolean
  placeholder?: string
  allowClear?: boolean
  size?: 'sm' | 'md'
  status?: 'error' | 'warning' | ''
  popupWidth?: number | string
}>(), { value: null, codes: null, allowClear: true, size: 'md', status: '', popupWidth: '20rem' })

const emit = defineEmits<{
  'update:value': [value: string | null]
  change: [unit: OkeiUnit | null]
}>()

const { t } = useI18n()
onMounted(() => { void ensureOkeiUnits() })

const label = (u: OkeiUnit) => `${u.code} — ${u.shortName || u.name}`
const units = computed(() => {
  const only = props.codes ? new Set(props.codes.map((c) => c.trim())) : null
  return only ? okeiUnits.value.filter((u) => only.has(u.code)) : okeiUnits.value
})
const options = computed<ZOption[]>(() => {
  const list: ZOption[] = units.value.map((u) => ({ value: u.code, label: label(u), name: u.name, shortName: u.shortName ?? '' }))
  const v = (props.value ?? '').trim()
  if (v && !list.some((o) => o.value === v)) {
    const known = okeiUnits.value.find((u) => u.code === v)
    list.unshift(known ? { value: v, label: label(known), name: known.name, shortName: known.shortName ?? '' } : { value: v, label: v, name: '', shortName: '' })
  }
  return list
})

const low = (s: unknown) => String(s ?? '').toLocaleLowerCase('ru')
// Поиск — по коду, наименованию и краткому наименованию (как в окне КЕДЕН).
const filter = (input: string, o: ZOption) => {
  const q = low(input).trim()
  return !q || low(o.value).includes(q) || low(o.name).includes(q) || low(o.shortName).includes(q)
}

const onUpdate = (v: ZOptionValue | ZOptionValue[] | null) => {
  const code = v == null || Array.isArray(v) || v === '' ? null : String(v)
  emit('update:value', code)
  emit('change', code ? okeiUnits.value.find((u) => u.code === code) ?? null : null)
}
</script>

<template>
  <ZSelect
    :value="value || null"
    :options="options"
    show-search
    :filter-option="filter"
    :allow-clear="allowClear"
    :disabled="disabled"
    :placeholder="placeholder ?? t('broker.dt.goods.editor.okei.placeholder')"
    :not-found-content="t('broker.dt.goods.editor.okei.notFound')"
    :size="size"
    :status="status"
    :popup-width="popupWidth"
    data-okei-select
    @update:value="onUpdate"
  >
    <template #option="{ option }">
      <span class="flex min-w-0 items-baseline gap-2" :data-okei-option="option.value">
        <span class="w-9 shrink-0 font-mono tabular-nums text-ink-2">{{ option.value }}</span>
        <span class="shrink-0 font-medium">{{ option.shortName || option.label }}</span>
        <span v-if="option.name" class="min-w-0 truncate text-ink-3">{{ option.name }}</span>
      </span>
    </template>
  </ZSelect>
</template>
