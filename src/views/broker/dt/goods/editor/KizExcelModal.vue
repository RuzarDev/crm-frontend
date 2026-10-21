<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhWarning } from '@phosphor-icons/vue'
import ZModal from '@/components/z/ZModal.vue'
import ZRadioGroup from '@/components/z/ZRadioGroup.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { Import40GoodsItemInput } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { kizKey, kizNumberProblem } from './kizCodes'
import { kizDefaultsEmpty, type KizDefaults } from './kizDefaults'
import {
  kizColumnKey, kizFileRows, matchKizRowsToGoods, type KizExcelApply, type KizExcelScan, type KizSheet,
} from './kizExcel'

// Предпросмотр «Из Excel» кодов идентификации (правка №12): сколько кодов и откуда столбец (по шапке, по содержимому,
// старый формат без шапки, выбран вручную), выбор столбца вручную — защита от неверного автоопределения, счётчики
// (ошибка GS1, повторы, не коды, искажённые Excel числа), первые коды, общие значения и раскладка по товарам ДТ.
// Ничего не меняет: применяет секция (событие apply).
const SAMPLE = 10
const LEGACY = 'legacy'
const props = defineProps<{
  open: boolean
  fileName: string
  sheets: readonly KizSheet[]
  scan: KizExcelScan | null
  defaults: KizDefaults
  goods: readonly Import40GoodsItemInput[]
  /** Позиция текущего товара (с 0). */
  currentIndex: number
  /** Номера, уже введённые в текущем товаре (kizKey). */
  existing: ReadonlySet<string>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; apply: [res: KizExcelApply] }>()
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.markings.${key}`, p ?? {})

const choice = ref<string | null>(null)
const mode = ref<'here' | 'distribute'>('here')
watch(() => props.scan, (s) => {
  choice.value = s?.legacy ? LEGACY : s?.best ? kizColumnKey(s.best) : null
}, { immediate: true })

const column = computed(() => {
  const c = choice.value
  if (!c || c === LEGACY) return null
  return props.scan?.options.find((o) => kizColumnKey(o) === c) ?? null
})
const legacy = computed(() => {
  if (choice.value !== LEGACY || !props.scan?.legacy) return null
  const seen = new Set(props.existing)
  let duplicates = 0
  const numbers: string[] = []
  for (const r of props.scan.legacy) {
    const k = kizKey(r.number)
    if (!k) continue
    if (seen.has(k)) { duplicates += 1; continue }
    seen.add(k)
    numbers.push(r.number!.trim())
  }
  return { numbers, duplicates }
})

const numbers = computed(() => legacy.value?.numbers ?? column.value?.codes.map((c) => c.number) ?? [])
const found = computed(() => numbers.value.length)
const ai = computed(() => props.defaults.idApplicationCode)
const badCheck = computed(() => numbers.value.filter((n) => kizNumberProblem(n, ai.value)).length)
const sample = computed(() => numbers.value.slice(0, SAMPLE).map((n) => ({ n, bad: !!kizNumberProblem(n, ai.value) })))

const source = computed(() => {
  if (legacy.value) return tm('excelLegacy')
  const c = column.value
  if (!c) return null
  if (c.source === 'header' && c.header) return tm('excelByHeader', { header: c.header, sheet: c.sheetName, letter: c.letter })
  if (c.source === 'content') return tm('excelByContent', { sheet: c.sheetName, letter: c.letter })
  return tm('excelByManual', { sheet: c.sheetName, letter: c.letter })
})

const columnOptions = computed<ZOption[]>(() => [
  ...(props.scan?.legacy ? [{ value: LEGACY, label: tm('excelLegacyOption') }] : []),
  ...(props.scan?.options ?? []).map((o) => ({
    value: kizColumnKey(o),
    label: tm('excelColumnOption', { sheet: o.sheetName, letter: o.letter, header: o.header ? ` «${o.header}»` : '', n: o.codes.length }),
  })),
])
const onChoice = (v: ZOptionValue | ZOptionValue[] | null) => { choice.value = v == null || Array.isArray(v) ? null : String(v) }

const counters = computed(() => {
  const c = column.value
  const dup = legacy.value?.duplicates ?? c?.duplicates ?? 0
  return [
    { key: 'excelBadCheck', n: badCheck.value, warn: true },
    { key: 'excelDuplicates', n: dup, warn: false },
    { key: 'excelSkipped', n: c?.skipped ?? 0, warn: false },
    { key: 'excelLossy', n: c?.lossy ?? 0, warn: true },
  ].filter((x) => x.n > 0)
})

const defaultsText = computed(() => {
  const d = props.defaults
  if (kizDefaultsEmpty(d)) return null
  const parts = [d.levelCode, d.idApplicationCode, d.idTypeCode, d.kizCount == null ? null : String(d.kizCount)].filter((v) => v != null && v !== '')
  if (d.aggregated) parts.push(tm('aggregatedYes'))
  return parts.join(' · ')
})

// Раскладка по товарам (12б-2): в ДТ больше одного товара, столбец по шапке или вручную, в шапке есть столбцы товара,
// и хоть одна строка сопоставилась с другим товаром или сопоставлено два товара и больше.
const match = computed(() => {
  const c = column.value
  if (!c || props.goods.length < 2) return null
  const rows = kizFileRows(props.sheets, c)
  if (!rows) return null
  const m = matchKizRowsToGoods(rows, props.goods)
  if (!m.groups.length || (m.groups.length < 2 && m.groups[0].goodsIndex === props.currentIndex)) return null
  return m
})
watch(match, (m) => { mode.value = m && m.groups.length >= 2 && !m.unmatched.length ? 'distribute' : 'here' }, { immediate: true })
const modeOptions = computed<ZOption[]>(() => [
  { value: 'here', label: tm('excelHere') },
  { value: 'distribute', label: tm('excelDistribute') },
])
const goodsLabel = (k: number) => props.goods[k]?.description ?? ''

const apply = () => {
  if (!found.value) return
  if (legacy.value && props.scan?.legacy) {
    emit('apply', { groups: [], legacy: props.scan.legacy })
    return
  }
  const m = match.value
  if (mode.value === 'distribute' && m) {
    const groups = m.groups.map((g) => ({ goodsIndex: g.goodsIndex, codes: [...g.codes] }))
    if (m.unmatched.length) {
      const cur = groups.find((g) => g.goodsIndex === props.currentIndex)
      if (cur) cur.codes.push(...m.unmatched)
      else groups.push({ goodsIndex: props.currentIndex, codes: [...m.unmatched] })
    }
    emit('apply', { groups, legacy: null })
    return
  }
  emit('apply', { groups: [{ goodsIndex: props.currentIndex, codes: [...numbers.value] }], legacy: null })
}
</script>

<template>
  <ZModal
    :open="open"
    :title="tm('excelTitle')"
    :width="640"
    :ok-text="tm('excelApply', { n: found })"
    :cancel-text="t('common.cancel')"
    :ok-button-props="{ disabled: !found }"
    destroy-on-close
    @update:open="emit('update:open', $event)"
    @ok="apply"
  >
    <div class="flex flex-col gap-4 text-sm text-ink" data-kiz-excel-modal>
      <p class="m-0 text-ink-2">
        <span class="font-mono text-xs break-all text-muted">{{ fileName }}</span><br>
        <b data-kiz-excel-found>{{ tm('excelFound', { n: found }) }}</b>
        <template v-if="source">
          <br><span class="text-[13px] text-ink-2" data-kiz-excel-source>{{ source }}</span>
        </template>
      </p>
      <p v-if="!source" class="m-0 rounded-row bg-gold-soft px-3 py-2 text-gold-ink" data-kiz-excel-none>{{ tm('excelNone') }}</p>

      <div class="flex flex-col gap-1">
        <span id="kiz-excel-column-label" class="text-xs text-ink-3">{{ tm('excelColumn') }}</span>
        <ZSelect
          :value="choice"
          :options="columnOptions"
          aria-labelledby="kiz-excel-column-label"
          :placeholder="tm('excelColumn')"
          class="max-sm:h-11"
          data-f="kiz-excel-column"
          @update:value="onChoice"
        />
      </div>

      <ul v-if="counters.length" class="m-0 flex list-none flex-col gap-1 p-0 text-[13px]" data-kiz-excel-counters>
        <li v-for="c in counters" :key="c.key" :class="c.warn ? 'text-gold-ink' : 'text-ink-2'" :data-kiz-excel-counter="c.key">{{ tm(c.key, { n: c.n }) }}</li>
      </ul>

      <div v-if="sample.length">
        <p class="m-0 mb-1.5 text-xs text-ink-3">{{ tm('excelSample') }}</p>
        <ol class="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-0.5 p-0 font-mono text-[13px] sm:grid-cols-2" data-kiz-excel-sample>
          <li v-for="(s, i) in sample" :key="i" class="flex min-w-0 items-center gap-1.5">
            <span class="truncate" :class="s.bad ? 'text-gold-ink' : 'text-ink'">{{ s.n }}</span>
            <PhWarning v-if="s.bad" :size="14" class="shrink-0 text-gold-ink" :aria-label="tm('problems.check')" />
          </li>
        </ol>
        <p v-if="found > sample.length" class="m-0 mt-1 text-xs text-muted">{{ tm('excelSampleMore', { n: found - sample.length }) }}</p>
      </div>

      <p v-if="defaultsText" class="m-0 text-[13px] text-ink-2" data-kiz-excel-defaults>{{ tm('excelDefaults', { values: defaultsText }) }}</p>
      <p v-else class="m-0 rounded-row bg-gold-soft px-3 py-2 text-gold-ink" data-kiz-excel-defaults-empty>{{ tm('excelDefaultsEmpty') }}</p>

      <div v-if="match" class="flex flex-col gap-2 border-t border-line pt-3">
        <span id="kiz-excel-mode-label" class="text-xs text-ink-3">{{ tm('excelMode') }}</span>
        <ZRadioGroup
          :value="mode"
          :options="modeOptions"
          orientation="vertical"
          aria-labelledby="kiz-excel-mode-label"
          data-kiz-excel-mode
          @update:value="mode = $event === 'distribute' ? 'distribute' : 'here'"
        />
        <ul v-if="mode === 'distribute'" class="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
          <li v-for="g in match.groups" :key="g.goodsIndex" class="flex min-w-0 gap-2" :data-kiz-excel-group="g.goodsIndex">
            <span class="shrink-0 text-ink">{{ tm('excelGroup', { n: g.goodsIndex + 1, codes: g.codes.length }) }}</span>
            <span class="truncate text-muted">{{ goodsLabel(g.goodsIndex) }}</span>
          </li>
          <li v-if="match.unmatched.length" class="text-gold-ink" data-kiz-excel-unmatched>{{ tm('excelUnmatched', { n: match.unmatched.length }) }}</li>
        </ul>
      </div>
    </div>
  </ZModal>
</template>
