<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { cn } from '@/ui/cn'
import { formatNumberIn } from '@/ui/number'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { CHARACTERISTIC_FIELDS, characteristicField, type CharacteristicField, type GoodsRowValue } from './characteristics'
import { buildRows, defaultMapping, detectHeader, splitPasted, type PasteIssue } from './characteristicsPaste'
import { ensureOkeiUnits, okeiShort } from './okei'

// «Заполнить через текст / из Excel» (строки гр. 31, как кнопка КЕДЕН): вставка ячеек из Excel (табуляция) или текста
// (строка на строку, колонки через «;»), сопоставление колонок (по умолчанию — порядок таблицы; первая строка с подписями
// узнаётся сама), просмотр с подсветкой нераспознанных ячеек, затем «Добавить к строкам» или «Заменить строки».
// Предел строк товара (500, как сервер) — кнопка недоступна и сказано почему. Разбор — characteristicsPaste.ts.
const props = defineProps<{
  /** Непустые строки товара сейчас (пустые при добавлении отбрасываются, как на сервере). */
  existing: number
  max: number
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ apply: [payload: { mode: 'append' | 'replace'; rows: GoodsRowValue[] }] }>()
const { t, locale } = useI18n()
const tp = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.chars.paste.${key}`, p ?? {})
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.chars.${key}`, p ?? {})

const text = ref('')
watch(open, (v) => {
  if (!v) return
  text.value = ''
  void ensureOkeiUnits()
})

const parsed = computed(() => splitPasted(text.value))
const columnCount = computed(() => parsed.value.cells.reduce((m, r) => Math.max(m, r.length), 0))
const detected = computed(() => detectHeader(parsed.value.cells[0]))
const hasHeader = ref(false)
const mapping = ref<(CharacteristicField | null)[]>([])
// Новый текст (другое число колонок или подписи) — сопоставление заново: по подписям или по порядку по умолчанию.
watch([columnCount, () => detected.value?.join('|') ?? ''], () => {
  hasHeader.value = !!detected.value
  mapping.value = detected.value ? [...detected.value] : defaultMapping(columnCount.value)
}, { immediate: true })
const onHeaderToggle = (v: boolean) => {
  hasHeader.value = v
  if (!v && detected.value) mapping.value = defaultMapping(columnCount.value)
  else if (v && detected.value) mapping.value = [...detected.value]
}

const SKIP = ''
const fieldOptions = computed<ZOption[]>(() => [
  { value: SKIP, label: tp('skip') },
  ...CHARACTERISTIC_FIELDS.map((c) => ({ value: c.key, label: tc(`col.${c.f}`) })),
])
/** Поле может быть только у одной колонки: выбрали занятое — прежняя колонка «не загружать». */
const setMapping = (col: number, v: ZOptionValue | ZOptionValue[] | null) => {
  const f = (v == null || Array.isArray(v) || v === SKIP ? null : String(v)) as CharacteristicField | null
  const next = [...mapping.value]
  if (f) next.forEach((x, k) => { if (x === f && k !== col) next[k] = null })
  next[col] = f
  mapping.value = next
}
const sample = (col: number) => parsed.value.cells[hasHeader.value ? 1 : 0]?.[col] ?? ''

const result = computed(() => buildRows(parsed.value.cells, mapping.value, hasHeader.value))
const count = computed(() => result.value.rows.length)
const mappedFields = computed(() => CHARACTERISTIC_FIELDS.filter((c) => mapping.value.includes(c.key)))

// Ошибки по ячейкам: «строка:поле».
const issueAt = computed(() => new Map(result.value.issues.map((x) => [`${x.row}:${x.field}`, x])))
const issueText = (x: PasteIssue) => tp(`issue.${x.kind}`, { row: x.row + 1, col: tc(`col.${characteristicField(x.field).f}`), raw: x.raw, max: x.max ?? 0 })
const PREVIEW_ROWS = 50
const ISSUE_LINES = 5
const previewRows = computed(() => result.value.rows.slice(0, PREVIEW_ROWS))
const cellText = (r: GoodsRowValue, f: CharacteristicField): string => {
  const v = r[f]
  if (v == null) return ''
  if (typeof v === 'number') return formatNumberIn(locale.value, v, 6)
  if (f === 'unitCode') return okeiShort(v) ?? v
  return v
}
const delimiterText = computed(() => tp(`delimiter.${parsed.value.delimiter}`))

// Предел строк товара: добавить — вместе с имеющимися; заменить — сами вставленные.
const left = computed(() => Math.max(0, props.max - props.existing))
const capReplace = computed(() => count.value > props.max)
const capAppend = computed(() => props.existing + count.value > props.max)
const capMessage = computed(() => {
  if (!count.value) return null
  if (capReplace.value) return tp('capTotal', { n: count.value, max: props.max })
  if (capAppend.value) return tp('capAppend', { have: props.existing, left: left.value, n: count.value, max: props.max })
  return null
})

const apply = (mode: 'append' | 'replace') => {
  if (!count.value || (mode === 'append' ? capAppend.value : capReplace.value)) return
  emit('apply', { mode, rows: result.value.rows })
  open.value = false
}

const th = 'border-b border-line px-2 py-1 text-left text-xs font-medium whitespace-nowrap text-ink-3'
const td = 'max-w-[14rem] truncate border-b border-line px-2 py-1 text-[13px]'
</script>

<template>
  <ZModal v-model:open="open" :title="tp('title')" :width="960" destroy-on-close data-chars-paste-modal>
    <template #description>{{ tp('hint') }}</template>
    <div class="flex flex-col gap-3 pt-2">
      <ZTextarea
        :value="text"
        :rows="7"
        :placeholder="tp('placeholder')"
        class="font-mono text-[13px]"
        :aria-label="tp('textLabel')"
        data-chars-paste-text
        @update:value="text = $event"
      />

      <template v-if="columnCount">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
          <span data-chars-paste-delimiter>{{ delimiterText }}</span>
          <label class="inline-flex cursor-pointer items-center gap-2">
            <ZCheckbox :checked="hasHeader" data-chars-paste-header @update:checked="onHeaderToggle" />
            {{ tp('header') }}
          </label>
        </div>

        <fieldset class="m-0 min-w-0 border-0 p-0">
          <legend class="mb-1 p-0 text-sm font-medium text-ink-2">{{ tp('mapping') }}</legend>
          <div class="flex gap-2 overflow-x-auto pb-1">
            <div v-for="(_, col) in columnCount" :key="col" class="flex w-40 shrink-0 flex-col gap-1" :data-chars-paste-col="col">
              <span class="text-xs text-muted">{{ tp('column', { n: col + 1 }) }}</span>
              <ZSelect
                :value="mapping[col] ?? SKIP"
                :options="fieldOptions"
                size="sm"
                :aria-label="tp('column', { n: col + 1 })"
                :data-chars-paste-map="col"
                @update:value="setMapping(col, $event)"
              />
              <span class="truncate text-xs text-muted" :title="sample(col)">{{ sample(col) || '—' }}</span>
            </div>
          </div>
        </fieldset>

        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-2" data-chars-paste-summary>
            {{ tp('summary', { n: count }) }}<template v-if="result.issues.length"> · <span class="text-danger">{{ tp('issues', { n: result.issues.length }) }}</span></template>
          </span>
          <ul v-if="result.issues.length" class="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px] text-danger" data-chars-paste-issues>
            <li v-for="x in result.issues.slice(0, ISSUE_LINES)" :key="`${x.row}:${x.field}`">{{ issueText(x) }}</li>
            <li v-if="result.issues.length > ISSUE_LINES" class="text-muted">{{ tp('moreIssues', { n: result.issues.length - ISSUE_LINES }) }}</li>
          </ul>
          <div v-if="count && mappedFields.length" class="max-h-64 overflow-auto rounded-field border border-line" data-chars-paste-preview>
            <table class="w-full border-collapse">
              <thead class="sticky top-0 bg-sunken">
                <tr>
                  <th :class="th" scope="col">№</th>
                  <th v-for="c in mappedFields" :key="c.key" :class="th" scope="col">{{ tc(`col.${c.f}`) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in previewRows" :key="i" :data-chars-paste-row="i">
                  <td :class="[td, 'text-muted tabular-nums']">{{ i + 1 }}</td>
                  <td
                    v-for="c in mappedFields"
                    :key="c.key"
                    :class="cn(td, c.kind === 'number' && 'text-right tabular-nums', issueAt.has(`${i}:${c.key}`) && 'bg-tone-danger-bg text-tone-danger-fg')"
                    :title="issueAt.has(`${i}:${c.key}`) ? issueText(issueAt.get(`${i}:${c.key}`)!) : cellText(r, c.key)"
                    :data-chars-paste-bad="issueAt.has(`${i}:${c.key}`) ? c.f : undefined"
                  >{{ issueAt.has(`${i}:${c.key}`) && !cellText(r, c.key) ? issueAt.get(`${i}:${c.key}`)!.raw : cellText(r, c.key) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="count > PREVIEW_ROWS" class="m-0 px-2 py-1 text-xs text-muted">{{ tp('previewMore', { n: count - PREVIEW_ROWS }) }}</p>
          </div>
        </div>
        <p v-if="capMessage" class="m-0 text-[13px] text-gold-ink" role="status" data-chars-paste-cap>{{ capMessage }}</p>
      </template>
    </div>

    <template #footer>
      <ZButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</ZButton>
      <ZButton :disabled="!count || capReplace" data-chars-paste-replace @click="apply('replace')">{{ tp('replace') }}</ZButton>
      <ZButton variant="primary" :disabled="!count || capAppend" data-chars-paste-append @click="apply('append')">{{ tp('append') }}</ZButton>
    </template>
  </ZModal>
</template>
