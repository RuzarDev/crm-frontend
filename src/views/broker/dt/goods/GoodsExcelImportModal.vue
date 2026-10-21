<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZRadioGroup from '@/components/z/ZRadioGroup.vue'
import { hasHan } from '@/utils/importText'
import { formatKg, formatQty } from '@/views/broker/transit/record/sections/goods'
import { okeiLabel } from './editor/okei'
import { excelPreview } from './goodsImport'
import { noteCount, noteDetails, type BuildResult } from './importBuild'
import type { MergeMode, MergePlan, MergeResult } from './importMerge'
import type { ImportRow } from './importRows'

// Предпросмотр «Из Excel» (пакет импорта 21.10.2026, №1–5, №15): файлы (несколько; лист книги — отдельный документ),
// сколько строк и что распознано, разные значения в файлах, куда пойдёт количество (гр. 41 / строка гр. 31), коды не из
// справочника, единицы, страны, упаковка по умолчанию; галочки перевода описаний (ИИ), производителя = отправителя и
// страны происхождения; если в ДТ уже есть товары — сколько совпало и режим: дополнить / заменить / добавить новыми.
const PREVIEW_ROWS = 5

export interface ImportFileView { source: string; kind: 'invoice' | 'packing' | null; rows: number }
export interface ImportOptions { translate: boolean; senderAsManufacturer: boolean; defaultOrigin: boolean; keepInvalidCodes: boolean }

const props = defineProps<{
  open: boolean
  files: readonly ImportFileView[]
  rows: readonly ImportRow[]
  built: BuildResult | null
  merge: MergeResult | null
  plan: MergePlan | null
  mode: MergeMode
  existing: number
  checking: boolean
  applying?: boolean
  options: ImportOptions
  /** Отправитель гр. 2 (галочка «Производитель = отправитель», В9). */
  senderName?: string | null
  /** Страна отправителя «156 — КИТАЙ» (галочка страны происхождения, В8). */
  originLabel?: string | null
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  apply: []
  'add-file': []
  'remove-file': [index: number]
  'update:mode': [mode: MergeMode]
  'update:options': [options: ImportOptions]
}>()
const { t, locale } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.excel.${key}`, p ?? {})

const summary = computed(() => (props.built ? excelPreview(props.rows, props.built) : null))
const recognized = computed(() => {
  const s = summary.value
  if (!s) return []
  const r = s.recognized
  return [
    { key: 'code', n: s.withCode },
    { key: 'description', n: r.description },
    { key: 'gross', n: r.gross },
    { key: 'net', n: r.net },
    { key: 'quantity', n: r.quantity },
    { key: 'unit', n: r.unit },
    { key: 'packaging', n: r.packaging },
    { key: 'places', n: r.places },
    { key: 'value', n: r.value },
    { key: 'country', n: r.country },
    ...(r.characteristics ? [{ key: 'characteristics', n: r.characteristics }] : []),
    ...(r.rowName ? [{ key: 'rowName', n: r.rowName }] : []),
    ...(r.cargoPart ? [{ key: 'cargoPart', n: r.cargoPart }] : []),
    ...(r.individualPackages ? [{ key: 'individualPackages', n: r.individualPackages }] : []),
    ...(r.tradeCodes ? [{ key: 'tradeCodes', n: r.tradeCodes }] : []),
  ]
})

const notes = computed(() => props.built?.notes ?? [])
const invalidCodes = computed(() => noteDetails(notes.value, 'invalidCode').map((d) => {
  const [code, reason] = d.split(':')
  return { code, reason }
}))
const docNumberCodes = computed(() => invalidCodes.value.filter((c) => c.reason === 'docNumber').map((c) => c.code))
const otherInvalid = computed(() => invalidCodes.value.filter((c) => c.reason !== 'docNumber'))
const count = (kind: Parameters<typeof noteCount>[1]) => noteCount(notes.value, kind)
const codesNotChecked = computed(() => notes.value.some((n) => n.kind === 'codesNotChecked'))
const hanCount = computed(() => props.rows.filter((r) => hasHan(r.description)).length)
const withoutManufacturer = computed(() => props.rows.filter((r) => !r.manufacturerName).length)
const withoutCountry = computed(() => props.rows.filter((r) => !r.countryCode).length)
const setOption = <K extends keyof ImportOptions>(k: K, v: ImportOptions[K]) => emit('update:options', { ...props.options, [k]: v })

const fieldLabel = (f: string) => tx(`conflictField.${f}`)
const fmt = (v: unknown) => (typeof v === 'number' ? formatQty(v, locale.value) : String(v ?? '—'))
const conflictLines = computed(() => (props.merge?.conflicts ?? []).map((c) => tx('conflictLine', {
  n: c.rowIndex + 1,
  field: fieldLabel(c.field),
  values: c.values.map((v) => `${fmt(v.value)} (${v.source})`).join(' / '),
  chosen: fmt(c.chosen),
})))

const matched = computed(() => props.plan?.matches.filter((m) => m.existing != null) ?? [])
const matchedBy = computed(() => {
  const by = new Map<string, number>()
  for (const m of matched.value) if (m.by) by.set(m.by, (by.get(m.by) ?? 0) + 1)
  return [...by].map(([k, n]) => `${tx(`matchBy.${k}`)} — ${n}`).join(', ')
})
const modeOptions = computed(() => (['fill', 'replace', 'append'] as const).map((m) => ({ value: m, label: tx(`mode.${m}`) })))

const head = computed(() => props.rows.slice(0, PREVIEW_ROWS))
const goodsAt = (i: number) => props.built?.goods[i] ?? null
const qtyTo = (i: number) => props.built?.quantityTo[i] ?? null
const num = (v: number | null | undefined, kg = false) => (v == null ? '—' : kg ? formatKg(v, locale.value) : formatQty(v, locale.value))
const unitOf = (i: number) => {
  const g = goodsAt(i)
  if (!g) return props.rows[i]?.unitText ?? ''
  const code = qtyTo(i) === 41 ? g.unitCode : g.characteristics?.[0]?.unitCode
  return code ? okeiLabel(code) : props.rows[i]?.unitText ?? ''
}
const okText = computed(() => (props.mode === 'append' || !props.existing ? tx('append') : tx('apply')))
const th = 'border-b border-line px-2 py-1.5 text-left text-xs font-medium text-ink-3'
const td = 'border-b border-line px-2 py-1.5 align-top'
const warn = 'm-0 rounded-row bg-gold-soft px-3 py-2 text-gold-ink'
</script>

<template>
  <ZModal
    :open="open"
    :title="tx('title')"
    :width="760"
    :ok-text="okText"
    :cancel-text="t('common.cancel')"
    :confirm-loading="applying"
    :ok-button-props="{ disabled: !rows.length || checking || !built }"
    destroy-on-close
    @update:open="emit('update:open', $event)"
    @ok="emit('apply')"
  >
    <div class="flex min-w-0 flex-col gap-4 text-sm text-ink" data-goods-excel-modal>
      <!-- Файлы -->
      <div class="flex flex-col gap-1.5" data-goods-excel-files>
        <p class="m-0 text-xs text-ink-3">{{ tx('files', { n: files.length }) }}</p>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="(f, i) in files" :key="`${f.source}-${i}`" class="flex min-w-0 items-center gap-2" data-goods-excel-file>
            <span class="min-w-0 flex-1 break-all font-mono text-xs text-muted">{{ f.source }}</span>
            <span class="shrink-0 text-xs text-ink-3">{{ tx(`fileKind.${f.kind ?? 'other'}`) }} · {{ tx('fileRows', { n: f.rows }) }}</span>
            <button
              v-if="files.length > 1"
              type="button"
              class="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink-3 hover:bg-sunken focus-visible:shadow-focus max-sm:size-11"
              :aria-label="tx('removeFile', { name: f.source })"
              data-goods-excel-remove
              @click="emit('remove-file', i)"
            >
              <PhX :size="14" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div>
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-goods-excel-add-file @click="emit('add-file')">
            <PhPlus :size="14" aria-hidden="true" />{{ tx('addFile') }}
          </ZButton>
        </div>
      </div>

      <p class="m-0 text-ink-2">
        <b data-goods-excel-rows>{{ tx('rows', { n: rows.length }) }}</b>
        <template v-if="files.length > 1"> · <span data-goods-excel-merged>{{ tx('merged', { n: rows.length }) }}</span></template>
      </p>
      <p v-for="o in merge?.onlyIn ?? []" :key="o.source" class="m-0 text-xs text-ink-3" data-goods-excel-only-in>
        {{ tx('onlyIn', { file: o.source, n: o.n }) }}
      </p>
      <details v-if="conflictLines.length" class="rounded-row bg-gold-soft px-3 py-2 text-gold-ink" data-goods-excel-conflicts>
        <summary class="cursor-pointer">{{ tx('conflicts', { n: conflictLines.length }) }}</summary>
        <ul class="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-xs">
          <li v-for="(l, i) in conflictLines.slice(0, 30)" :key="i">{{ l }}</li>
        </ul>
      </details>

      <p v-if="checking" class="m-0 text-ink-3" role="status" data-goods-excel-checking>{{ tx('checkingCodes') }}</p>

      <template v-if="summary">
        <div>
          <p class="m-0 mb-1.5 text-xs text-ink-3">{{ tx('recognized') }}</p>
          <ul class="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 min-[420px]:grid-cols-2 sm:grid-cols-3">
            <li v-for="r in recognized" :key="r.key" class="flex justify-between gap-2" :data-goods-excel-field="r.key">
              <span class="text-ink-2">{{ tx(`fields.${r.key}`) }}</span>
              <span class="tabular-nums" :class="r.n ? 'text-ink' : 'text-muted'">{{ tx('of', { n: r.n, total: summary.rows }) }}</span>
            </li>
          </ul>
        </div>

        <!-- Замечания -->
        <p v-if="codesNotChecked" :class="warn" data-goods-excel-not-checked>{{ tx('codesNotChecked') }}</p>
        <div v-if="otherInvalid.length" :class="warn" data-goods-excel-invalid>
          <p class="m-0">{{ tx('invalidCodes', { n: otherInvalid.length }) }} <span class="font-mono text-xs">{{ otherInvalid.map((c) => c.code).join(', ') }}</span></p>
          <div class="mt-1.5" data-goods-excel-keep-invalid>
            <ZCheckbox :checked="options.keepInvalidCodes" @update:checked="setOption('keepInvalidCodes', $event)">
              {{ tx('keepInvalidCodes') }}
            </ZCheckbox>
          </div>
        </div>
        <p v-if="docNumberCodes.length" :class="warn" data-goods-excel-doc-number>{{ tx('docNumberCodes', { list: docNumberCodes.join(', ') }) }}</p>
        <p v-if="summary.withoutCode && !otherInvalid.length && !docNumberCodes.length" :class="warn" data-goods-excel-no-code>
          {{ tx('withoutCode', { n: summary.withoutCode }) }}
        </p>
        <p v-if="count('toRow')" class="m-0 text-ink-2" data-goods-excel-to-row>{{ tx('toRow', { n: count('toRow') }) }}</p>
        <p v-if="count('deiMismatch')" :class="warn" data-goods-excel-dei-mismatch>{{ tx('deiMismatch', { n: count('deiMismatch') }) }}</p>
        <p v-if="count('noUnit')" :class="warn" data-goods-excel-no-unit>{{ tx('noUnit', { n: count('noUnit') }) }}</p>
        <p v-if="noteDetails(notes, 'unknownUnit').length" :class="warn" data-goods-excel-unknown-unit>
          {{ tx('unknownUnits', { list: noteDetails(notes, 'unknownUnit').map((v) => `«${v}»`).join(', ') }) }}
        </p>
        <p v-if="noteDetails(notes, 'unknownCountry').length" :class="warn" data-goods-excel-unknown-country>
          {{ tx('unknownCountries', { list: noteDetails(notes, 'unknownCountry').map((v) => `«${v}»`).join(', ') }) }}
        </p>
        <p v-if="count('packagingDefault')" class="m-0 text-ink-2" data-goods-excel-packaging-default>{{ tx('packagingDefault', { n: count('packagingDefault') }) }}</p>
        <p v-if="summary.documents" class="m-0 text-ink-2" data-goods-excel-documents>{{ tx('documents', { n: summary.documents }) }}</p>
        <p v-if="summary.netOverGross" class="m-0 rounded-row bg-tone-danger-bg px-3 py-2 text-tone-danger-fg" data-goods-excel-net-over-gross>
          {{ tx('netOverGross', { n: summary.netOverGross }) }}
        </p>
        <p v-if="summary.unknownPackaging.length" :class="warn" data-goods-excel-unknown-packaging>
          {{ tx('unknownPackaging', { list: summary.unknownPackaging.map((v) => `«${v}»`).join(', ') }) }}
        </p>

        <!-- Галочки -->
        <div v-if="hanCount || (senderName && withoutManufacturer) || (originLabel && withoutCountry)" class="flex flex-col gap-2">
          <div v-if="hanCount" data-goods-excel-translate>
            <ZCheckbox :checked="options.translate" @update:checked="setOption('translate', $event)">
              {{ tx('translate', { n: hanCount }) }}
            </ZCheckbox>
            <p class="m-0 mt-0.5 pl-6 text-xs text-ink-3">{{ tx('translateHint') }}</p>
          </div>
          <div v-if="senderName && withoutManufacturer" data-goods-excel-sender-manufacturer>
            <ZCheckbox :checked="options.senderAsManufacturer" @update:checked="setOption('senderAsManufacturer', $event)">
              {{ tx('senderAsManufacturer', { n: withoutManufacturer, name: senderName }) }}
            </ZCheckbox>
          </div>
          <div v-if="originLabel && withoutCountry" data-goods-excel-default-origin>
            <ZCheckbox :checked="options.defaultOrigin" @update:checked="setOption('defaultOrigin', $event)">
              {{ tx('defaultOrigin', { n: withoutCountry, country: originLabel }) }}
            </ZCheckbox>
          </div>
        </div>

        <!-- Товары уже есть -->
        <div v-if="existing" class="flex flex-col gap-2 rounded-row border border-line px-3 py-2.5" data-goods-excel-existing>
          <p class="m-0 text-ink-2">
            {{ tx('existing', { n: existing, matched: matched.length }) }}<template v-if="matchedBy"> ({{ matchedBy }})</template>
          </p>
          <ZRadioGroup orientation="vertical" :value="mode" :options="modeOptions" data-goods-excel-mode @update:value="emit('update:mode', $event as MergeMode)" />
          <p class="m-0 text-xs text-ink-3">{{ tx(`modeHint.${mode}`) }}</p>
          <p v-if="mode === 'fill' && plan?.conflicts.length" class="m-0 text-xs text-gold-ink" data-goods-excel-existing-conflicts>
            {{ tx('existingConflicts', { n: plan.conflicts.length }) }}
          </p>
        </div>

        <!-- Первые строки -->
        <div class="overflow-x-auto">
          <table class="w-full border-separate border-spacing-0 text-[13px]" :aria-label="tx('previewLabel')">
            <thead>
              <tr>
                <th :class="th">{{ tx('fields.code') }}</th>
                <th :class="th">{{ tx('fields.description') }}</th>
                <th :class="[th, 'text-right']">{{ tx('fields.quantity') }}</th>
                <th :class="[th, 'text-right']">{{ tx('fields.gross') }}</th>
                <th :class="th">{{ tx('fields.packaging') }}</th>
                <th :class="[th, 'text-right']">{{ tx('fields.places') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in head" :key="i" data-goods-excel-preview-row>
                <td :class="[td, 'font-mono whitespace-nowrap']">
                  <template v-if="r.tnvedCode">
                    <span v-if="goodsAt(i)?.tnvedCode">{{ goodsAt(i)!.tnvedCode }}</span>
                    <span v-else class="text-muted line-through" :title="tx('codeDropped')">{{ r.tnvedCode }}</span>
                  </template>
                  <span v-else class="font-sans text-danger">{{ t('broker.dt.goods.noCode') }}</span>
                </td>
                <td :class="[td, 'max-w-60 truncate']" :title="r.description ?? ''">
                  {{ r.description || '—' }}
                  <span v-if="hasHan(r.description) && options.translate" class="block text-xs text-ink-3">{{ tx('willTranslate') }}</span>
                </td>
                <td :class="[td, 'text-right tabular-nums whitespace-nowrap']">
                  {{ num(r.quantity) }} <span class="text-xs text-ink-3">{{ unitOf(i) }}</span>
                  <span v-if="qtyTo(i)" class="block text-xs text-ink-3" data-goods-excel-qty-to>{{ tx(qtyTo(i) === 41 ? 'goesTo41' : 'goesTo31') }}</span>
                </td>
                <td :class="[td, 'text-right tabular-nums']">{{ num(r.grossWeightKg, true) }}</td>
                <td :class="td">
                  <span v-if="goodsAt(i)?.packageKindCode" class="font-mono">{{ goodsAt(i)!.packageKindCode }}</span>
                  <span v-else-if="r.packageKindText" class="text-muted line-through" :title="tx('packagingSkipped')">{{ r.packageKindText }}</span>
                  <template v-else>—</template>
                </td>
                <td :class="[td, 'text-right tabular-nums']">{{ num(r.places) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="rows.length > head.length" class="m-0 mt-1.5 text-xs text-muted">{{ tx('more', { n: rows.length - head.length }) }}</p>
        </div>
        <p v-if="!existing || mode === 'append'" class="m-0 text-xs text-ink-3">{{ tx('appendNote', { n: existing }) }}</p>
      </template>
    </div>
  </ZModal>
</template>
