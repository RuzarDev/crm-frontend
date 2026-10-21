<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhPlus, PhUploadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import { chipFrame, chipTrigger } from '@/components/broker/chipStyles'
import { useClassifiersStore } from '@/stores/classifiers'
import { confirmState, useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import {
  GOODS_EXCEL_ACCEPT, GOODS_EXCEL_MESSAGES, goodsHeaderColumns, isExcelFileName, readExcelDocuments, type ExcelSheetDoc,
} from '@/utils/goodsExcel'
import { countryFromText, packagingLine, packagingWord } from '@/utils/importText'
import { docHeaderFrom, docKindOf } from '@/views/broker/case/steps/excelFallback'
import ApplyToSelectedModal from './ApplyToSelectedModal.vue'
import GoodsBulkBar from './GoodsBulkBar.vue'
import GoodsExcelImportModal, { type ImportFileView, type ImportOptions } from './GoodsExcelImportModal.vue'
import GoodsTable from './GoodsTable.vue'
import GoodsTotalsBar from './GoodsTotalsBar.vue'
import GoodsEditor from './editor/GoodsEditor.vue'
import { emptyGoodsPageContext, type GoodsEditorContext, type GoodsPageContext, type GoodsSaveState } from './editor/types'
import type { BulkPatch } from './goodsBulk'
import { exportGoodsXlsx } from './goodsExport'
import { dtDocsFromRows } from './goodsImport'
import { buildGoods, DEFAULT_ORIGIN_DEFAULT, SENDER_AS_MANUFACTURER_DEFAULT } from './importBuild'
import { applyMerge, mergeImportDocs, planMerge, type MergeMode, type MergeResult } from './importMerge'
import { resolveCodes, type ResolveResult } from './importResolve'
import { fromExcelRow, type ImportDoc } from './importRows'
import { ensureOkeiUnits } from './editor/okei'
import { filterGoods, formatItemNumbers, goodsTotals, type GoodsFilter } from './goodsList'
import { goodsPaymentsStale, isErrorStatus, withCodeCheck, type GoodsStatus } from './goodsStatus'
import { provideDtTnvedCheck, useGoodsCodesValidation } from './tnvedCodeCheck'
import { keyOf, type DtGoodsModel } from './useDtGoods'
import { useGoodsItemRoute } from './useGoodsItemRoute'

// Раздел «Товары» страницы ДТ (волна 6б, доска DtGoods): заголовок «Товары N · гр. 31–46», поиск (`/`), фильтры
// «С ошибками · N» и «Пересчитать · N», «Из Excel» (с предпросмотром), «В Excel», «Добавить товар» (N); таблица
// со статусами и выбором строк, тёмная панель массовых действий; итоги закреплены внизу раздела с «Рассчитать».
// Товары правятся на месте через модель useDtGoods (одна на страницу); открытый товар — в адресе `?item=N`
// (useGoodsItemRoute). Редактор товара — editor/GoodsEditor (панель справа; данные страницы — editorContext).
// В просмотре: без чекбоксов и действий изменения, «В Excel» доступен, товар открывается для чтения.
const props = defineProps<{
  model: DtGoodsModel
  /** гр. 22 — валюта сделки (заголовок «Фактурная»). */
  currency: string | null
  /** Номер ДТ (имя файла «В Excel»). */
  dtNumber?: string | null
  readonly: boolean
  countryOptions?: { value: string; label: string; alpha2?: string | null }[]
  /** Идёт расчёт платежей (кнопка «Рассчитать»). */
  paymentsLoading?: boolean
  /** Данные страницы для редактора товара: курс USD и дата гр. А, валюты, гр. 1, гр. 19. */
  editorContext?: GoodsPageContext
  /** Состояние сохранения ДТ — подвал редактора. */
  saveState?: GoodsSaveState | null
}>()
const emit = defineEmits<{ 'calc-payments': [] }>()
const { t } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.${key}`, p ?? {})
const { confirm } = useConfirm()
const classifiers = useClassifiersStore()

const items = computed(() => props.model.items.value)
const editable = computed(() => !props.readonly)

// ---- Коды ТН ВЭД: различные коды всех товаров проверяются сразу (кэш общий с редактором) ----
// Код не из справочника виден в списке без открытия товара: статус «нет в справочнике», фильтр «С ошибками».
const codeCheck = provideDtTnvedCheck()
useGoodsCodesValidation(codeCheck, () => items.value.map((g) => g.tnvedCode))
const statusOf = (g: (typeof items.value)[number]): GoodsStatus => withCodeCheck(props.model.statusOf(g), codeCheck.isInvalid(g.tnvedCode))

// ---- Поиск и фильтры ----
const query = ref('')
const filter = ref<GoodsFilter>(null)
const rows = computed(() => filterGoods(items.value, { query: query.value, filter: filter.value, statusOf }))
const counts = computed(() => {
  let missing = 0
  let stale = 0
  for (const g of items.value) {
    const s = statusOf(g)
    if (isErrorStatus(s)) missing++
    else if (s.kind === 'stale') stale++
  }
  return { missing, stale }
})
const toggleFilter = (f: Exclude<GoodsFilter, null>) => { filter.value = filter.value === f ? null : f }
// Фильтр опустел (всё исправили) — снимается сам, чтобы не остаться с пустой таблицей.
watch(counts, (c) => {
  if (filter.value && c[filter.value] === 0) filter.value = null
})
const resetSearch = () => {
  query.value = ''
  filter.value = null
}
const searchEl = ref<InstanceType<typeof ZInput> | null>(null)
const focusSearch = () => {
  const el = (searchEl.value?.$el as HTMLElement | undefined)
  const input = el?.matches?.('input') ? el : el?.querySelector?.('input')
  input?.focus()
}

// ---- Выбор строк (по ключам товаров: переживает правки, перестановку и удаление соседей) ----
const selectedKeys = ref<number[]>([])
const positionByKey = computed(() => new Map(items.value.map((g, i) => [keyOf(g), i])))
const selectedIndexes = computed(() =>
  selectedKeys.value.map((k) => positionByKey.value.get(k)).filter((i): i is number => i !== undefined).sort((a, b) => a - b))
// Товара больше нет — его ключ из выбора уходит.
watch(positionByKey, (pos) => {
  const kept = selectedKeys.value.filter((k) => pos.has(k))
  if (kept.length !== selectedKeys.value.length) selectedKeys.value = kept
})
watch(() => props.readonly, (ro) => { if (ro) selectedKeys.value = [] })
const clearSelection = () => { selectedKeys.value = [] }

// ---- Открытый товар (?item=N) ----
const itemRoute = useGoodsItemRoute(() => items.value)
const { openIndex, openKey, openItem, closeItem } = itemRoute
const editorCtx = computed<GoodsEditorContext>(() => ({
  ...(props.editorContext ?? emptyGoodsPageContext()),
  currency: props.currency || null,
  countryOptions: props.countryOptions ?? [],
}))
// Редактор закрыли — фокус на кнопку кода строки этого товара (если строка видна при текущем поиске/фильтре).
const root = ref<HTMLElement | null>(null)
const rowOpenButton = (key: number): HTMLElement | null => {
  const pos = positionByKey.value.get(key)
  return pos == null ? null : root.value?.querySelector<HTMLElement>(`[data-goods-row="${pos}"] [data-goods-open]`) ?? null
}

// ---- Действия ----
const add = async () => {
  if (!editable.value) return
  const g = props.model.add()
  if (!g) return
  await openItem(items.value.indexOf(g))
}

const removeSelected = async () => {
  const at = selectedIndexes.value
  if (!editable.value || !at.length) return
  const impact = props.model.removalImpact(at)
  const list = formatItemNumbers(at)
  const parts = [tg('remove.text')]
  if (impact.doc44 || impact.prevDocs) parts.push(tg('remove.docs', { doc44: impact.doc44, prev: impact.prevDocs }))
  const keys = [...selectedKeys.value]
  const ok = await confirm({
    title: at.length === 1 ? tg('remove.titleOne', { list }) : tg('remove.titleMany', { list }),
    content: parts.join(' '),
    okText: tg('remove.ok'),
    cancelText: t('common.cancel'),
    danger: true,
  })
  if (!ok) return
  // За время вопроса список мог поменяться — позиции заново по ключам.
  const now = keys.map((k) => positionByKey.value.get(k)).filter((i): i is number => i !== undefined)
  const res = props.model.remove(now)
  selectedKeys.value = []
  if (res.removed) message.success(tg('remove.done', { n: res.removed }))
}

const duplicateSelected = () => {
  if (!editable.value || !selectedIndexes.value.length) return
  const copies = props.model.duplicate(selectedIndexes.value)
  if (copies.length) message.success(tg('duplicated', { n: copies.length }))
}

const applyOpen = ref(false)
const applyIndexes = ref<number[]>([])
const openApply = () => {
  if (!editable.value || !selectedIndexes.value.length) return
  applyIndexes.value = [...selectedIndexes.value]
  applyOpen.value = true
}
const onApply = (patch: BulkPatch) => {
  const n = props.model.applyToSelected(applyIndexes.value, patch)
  applyOpen.value = false
  message.success(tg('apply.done', { n }))
}

// ---- Из Excel (пакет импорта 21.10.2026: несколько файлов, листы книги, слияние с товарами ДТ, «Отменить») ----
const fileInput = ref<HTMLInputElement | null>(null)
const excelBusy = ref(false)
const excelOpen = ref(false)
const importDocs = shallowRef<(ImportDoc & { invoiceNo: string | null })[]>([])
const importMerge = shallowRef<MergeResult | null>(null)
const importResolved = shallowRef<ResolveResult | null>(null)
const importChecking = ref(false)
const importMode = ref<MergeMode>('fill')
// В9/В8 (производитель и страна — выключены): одни значения с «Из документов». Описания — как в документе: перевода ИИ
// при импорте нет (решение владельца 21.10.2026).
const importOptions = ref<ImportOptions>({
  senderAsManufacturer: SENDER_AS_MANUFACTURER_DEFAULT, defaultOrigin: DEFAULT_ORIGIN_DEFAULT, keepInvalidCodes: false,
})
// Виды упаковки (классификатор 2013, грузит страница): «Вид упаковки товара» из Excel — в гр. 31 товара (X1).
const packageKinds = computed(() => classifiers.cache['2013'] ?? [])
const senderName = computed(() => props.editorContext?.senderName?.trim() || null)
const senderCountry = computed(() => props.editorContext?.senderCountryCode?.trim() || null)
const originLabel = computed(() => (senderCountry.value ? (props.countryOptions ?? []).find((c) => c.value === senderCountry.value)?.label ?? senderCountry.value : null))
const importFiles = computed<ImportFileView[]>(() => importDocs.value.map((d) => ({ source: d.source, kind: d.kind, rows: d.rows.length })))
const importBuilt = computed(() => {
  const m = importMerge.value
  if (!m || importChecking.value) return null
  const o = importOptions.value
  return buildGoods(m.rows, {
    currency: props.currency,
    packageKinds: packageKinds.value,
    resolved: importResolved.value,
    options: {
      senderAsManufacturer: o.senderAsManufacturer ? senderName.value : null,
      defaultOriginCode: o.defaultOrigin ? senderCountry.value : null,
      keepInvalidCodes: o.keepInvalidCodes,
    },
  })
})
const importPlan = computed(() => (importBuilt.value ? planMerge(items.value, importBuilt.value.goods, items.value.length ? importMode.value : 'append') : null))

const pickExcel = () => { if (editable.value) fileInput.value?.click() }

/** Лист книги → документ импорта: вид (инвойс / упаковочный), номер из шапки, подсказка упаковки (столбец мест, «Упаковка: …»). */
const sheetToImportDoc = (fileName: string, d: ExcelSheetDoc, many: boolean) => {
  const source = many ? `${fileName} · ${d.sheet}` : fileName
  const header = docHeaderFrom(fileName, d.headerRows, d.tableHeader)
  const kind = docKindOf(`${fileName} ${d.sheet}`, d.headerRows.flat().filter((c) => c != null).join(' ')) ?? header.kind
  const cols = goodsHeaderColumns(d.tableHeader, { details: true, tradeCodes: true }, d.rows.slice(1, 50))
  const placesHeader = cols.packagesCount != null ? String(d.tableHeader[cols.packagesCount] ?? '') : ''
  const hint = packagingLine(d.rows) ?? (packagingWord(placesHeader) ? placesHeader : null)
  return { source, kind, rows: d.goods.map((g) => fromExcelRow(g, source, hint)), invoiceNo: kind === 'invoice' ? header.number : null }
}

let importToken = 0
const recomputeImport = async () => {
  const token = ++importToken
  const docs = importDocs.value
  if (!docs.length) {
    importMerge.value = null
    excelOpen.value = false
    return
  }
  const merged = mergeImportDocs(docs)
  importMerge.value = merged
  importChecking.value = true
  try {
    const [res] = await Promise.all([
      resolveCodes(merged.rows.map((r) => r.tnvedCode), { invoiceNo: docs.find((d) => d.invoiceNo)?.invoiceNo ?? null }),
      // Единицы строк («шт» → 796) — по справочнику ОКЕИ; не загрузился — коды и латинские обозначения как есть.
      ensureOkeiUnits().catch(() => undefined),
    ])
    if (token === importToken) importResolved.value = res
  } finally {
    if (token === importToken) importChecking.value = false
  }
}

const onFile = async (e: Event) => {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  if (!files.length) return
  excelBusy.value = true
  const added: (ImportDoc & { invoiceNo: string | null })[] = []
  const countries = props.countryOptions ?? []
  try {
    for (const file of files) {
      if (!isExcelFileName(file.name)) {
        message.error(files.length > 1 ? tg('excel.notExcel', { name: file.name }) : t('dt.dopustimTolkoExcel'))
        continue
      }
      try {
        const result = await readExcelDocuments(file, {
          tradeCodes: true, details: true, countryResolver: (text) => countryFromText(text, countries),
        })
        if ('problem' in result) {
          message.warning(files.length > 1 ? `${file.name}: ${t(GOODS_EXCEL_MESSAGES[result.problem])}` : t(GOODS_EXCEL_MESSAGES[result.problem]))
          continue
        }
        for (const d of result.docs) added.push(sheetToImportDoc(file.name, d, result.docs.length > 1))
      } catch (err) {
        console.error('Failed to import goods from Excel', err)
        message.error(files.length > 1 ? tg('excel.fileFailed', { name: file.name }) : t('dt.neUdalosProchitatFayl'))
      }
    }
  } finally {
    excelBusy.value = false
  }
  if (!added.length) return
  importDocs.value = [...(excelOpen.value ? importDocs.value : []), ...added]
  if (!excelOpen.value) importMode.value = 'fill'
  excelOpen.value = true
  void recomputeImport()
}
const removeImportFile = (i: number) => {
  importDocs.value = importDocs.value.filter((_, k) => k !== i)
  void recomputeImport()
}
watch(excelOpen, (open) => {
  if (open) return
  importDocs.value = []
  importMerge.value = null
  importResolved.value = null
})

const applyImport = () => {
  const built = importBuilt.value
  const plan = importPlan.value
  const merged = importMerge.value
  if (!built || !plan || !merged || !editable.value) return
  const mode: MergeMode = items.value.length ? importMode.value : 'append'
  const snap = props.model.snapshot()
  const res = applyMerge(props.model, built.goods, plan, mode)
  const docs = props.model.appendDocs(dtDocsFromRows(merged.rows, (i) => res.targetIndex[i]))
  excelOpen.value = false
  const content = res.updated
    ? tg('excel.doneMerged', { updated: res.updated, added: res.added })
    : docs ? tg('excel.doneWithDocs', { n: res.added, docs }) : tg('excel.done', { n: res.added })
  message.success({
    content: res.rowsSkipped ? `${content}. ${tg('excel.rowsSkipped', { n: res.rowsSkipped })}` : content,
    duration: 15,
    action: {
      label: tg('excel.undo'),
      onClick: () => {
        props.model.restore(snap)
        message.info(tg('excel.undone'))
      },
    },
  })
}

const exporting = ref(false)
const exportExcel = async () => {
  if (!items.value.length) return
  exporting.value = true
  try {
    await exportGoodsXlsx(items.value, (k) => t(k), props.dtNumber, countryText.value)
  } catch (err) {
    console.error('Failed to export goods', err)
    message.error(tg('export.failed'))
  } finally {
    exporting.value = false
  }
}

// ---- Итоги ----
const totals = computed(() => goodsTotals(items.value))
const anyStale = computed(() => items.value.some(goodsPaymentsStale))

// ---- Клавиши раздела: `/` — поиск, N — новый товар, Esc — снять выделение ----
const typing = (el: EventTarget | null) => {
  const node = el as HTMLElement | null
  return !!node?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"]')
}
const dialogOpen = () =>
  confirmState.open || !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
const onKey = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
  if (e.key === 'Escape') {
    if (!selectedKeys.value.length || dialogOpen() || typing(e.target)) return
    clearSelection()
    return
  }
  if (typing(e.target) || dialogOpen()) return
  // «/» — и по физической клавише: на ЙЦУКЕН она даёт «.», а N уже ловится по e.code.
  const slash = e.key === '/' || (e.code === 'Slash' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey)
  if (slash) {
    e.preventDefault()
    focusSearch()
  } else if (e.code === 'KeyN' && !e.shiftKey && editable.value) {
    e.preventDefault()
    void add()
  }
}
let listening = false
const listen = (on: boolean) => {
  if (on === listening) return
  listening = on
  if (on) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}
onMounted(() => listen(true))
onActivated(() => listen(true))
onDeactivated(() => listen(false))
onBeforeUnmount(() => listen(false))

const countryAlpha = computed(() => {
  const map = new Map((props.countryOptions ?? []).filter((c) => c.alpha2).map((c) => [c.value, c.alpha2 as string]))
  return (code: string) => map.get(code) ?? null
})

// «В Excel»: страна — как в таблице, буквами, и с названием («CN — КИТАЙ»), а не цифровой ОКСМ.
const countryText = computed(() => {
  const map = new Map((props.countryOptions ?? []).map((c) => {
    // Подпись «код — название»; у особых записей («ЕС») подпись начинается с буквенного кода («EU — Евросоюз»).
    const prefix = [`${c.value} — `, c.alpha2 ? `${c.alpha2} — ` : null].find((p) => p && c.label.startsWith(p))
    const name = prefix ? c.label.slice(prefix.length) : c.label
    return [c.value, [c.alpha2, name].filter((s) => !!s && String(s).trim()).join(' — ')]
  }))
  return (code: string) => map.get(code) || null
})

defineExpose({ openItem, closeItem, step: itemRoute.step, openIndex, focusSearch })
</script>

<template>
  <section ref="root" class="flex min-w-0 flex-col gap-3" data-dt-goods>
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 class="m-0 mr-auto flex items-baseline gap-2 text-[15px] font-semibold text-ink">
        {{ tg('title') }}
        <span class="rounded-pill bg-sunken px-1.5 text-xs font-semibold text-ink-2 tabular-nums" data-goods-count>{{ items.length }}</span>
        <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '31–46' }) }}</span>
      </h2>
      <template v-if="items.length">
        <ZButton variant="ghost" :loading="exporting" class="max-sm:h-11" data-goods-export @click="exportExcel">
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ tg('toExcel') }}
        </ZButton>
      </template>
      <template v-if="editable">
        <input ref="fileInput" type="file" multiple class="hidden" tabindex="-1" aria-hidden="true" :accept="GOODS_EXCEL_ACCEPT" data-goods-excel-input @change="onFile">
        <ZButton variant="ghost" :loading="excelBusy" class="max-sm:h-11" data-goods-excel @click="pickExcel">
          <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
          {{ tg('fromExcel') }}
        </ZButton>
        <ZButton class="max-sm:h-11" data-goods-add @click="add">
          <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
          {{ tg('add') }}
          <ZKbd class="max-sm:hidden">N</ZKbd>
        </ZButton>
      </template>
    </header>

    <!-- Пусто -->
    <div v-if="!items.length" class="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line-strong px-4 py-10 text-center" data-goods-empty>
      <p class="m-0 text-sm font-semibold text-ink">{{ tg('empty') }}</p>
      <template v-if="editable">
        <p class="m-0 max-w-sm text-sm text-ink-3">{{ tg('emptyHint') }}</p>
        <div class="flex flex-wrap justify-center gap-2">
          <ZButton variant="primary" class="max-sm:h-11" data-goods-empty-add @click="add">
            <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
            {{ tg('add') }}
          </ZButton>
          <ZButton class="max-sm:h-11" :loading="excelBusy" data-goods-empty-excel @click="pickExcel">
            <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
            {{ tg('fromExcel') }}
          </ZButton>
        </div>
      </template>
    </div>

    <template v-else>
      <span class="sr-only" role="status" aria-live="polite">{{ selectedIndexes.length ? tg('bulk.selected', { n: selectedIndexes.length }) : '' }}</span>
      <div v-if="!selectedIndexes.length" class="flex min-h-12 flex-wrap items-center gap-2">
        <ZInput
          ref="searchEl"
          type="search"
          allow-clear
          :value="query"
          :placeholder="tg('search')"
          :aria-label="tg('search')"
          class="h-[34px] w-full min-w-0 text-[13px] max-sm:h-11 sm:max-w-[320px] sm:flex-[1_1_14rem]"
          data-goods-search
          @update:value="query = $event"
        />
        <div :class="chipFrame(filter === 'missing')">
          <button
            type="button"
            :class="chipTrigger"
            :aria-pressed="filter === 'missing'"
            :disabled="!counts.missing && filter !== 'missing'"
            data-goods-filter="missing"
            @click="toggleFilter('missing')"
          >
            <StatusDot tone="danger" :label="tg('filterMissing', { n: counts.missing })" />
          </button>
        </div>
        <div :class="chipFrame(filter === 'stale')">
          <button
            type="button"
            :class="chipTrigger"
            :aria-pressed="filter === 'stale'"
            :disabled="!counts.stale && filter !== 'stale'"
            data-goods-filter="stale"
            @click="toggleFilter('stale')"
          >
            <StatusDot tone="accent" :label="tg('filterStale', { n: counts.stale })" />
          </button>
        </div>
      </div>

      <!-- Выбраны строки — тёмная панель на месте поиска (как на доске): таблица не сдвигается. -->
      <GoodsBulkBar
        v-else
        :count="selectedIndexes.length"
        @apply="openApply"
        @duplicate="duplicateSelected"
        @remove="removeSelected"
        @clear="clearSelection"
      />

      <div v-if="!rows.length" class="flex flex-col items-center gap-2 rounded-panel border border-line px-4 py-8 text-center" data-goods-not-found>
        <p class="m-0 text-sm text-ink-2">{{ tg('notFound') }}</p>
        <ZButton variant="link" data-goods-reset @click="resetSearch">{{ tg('resetFilters') }}</ZButton>
      </div>
      <GoodsTable
        v-else
        v-model:selected-keys="selectedKeys"
        :rows="rows"
        :status-of="statusOf"
        :currency="currency"
        :readonly="readonly"
        :open-key="openKey"
        :country-alpha="countryAlpha"
        @open="openItem"
      />

      <p class="m-0 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted max-sm:hidden">
        {{ tg('hint') }}
        <template v-if="editable"><ZKbd>N</ZKbd> {{ tg('keyNew') }} ·</template>
        <ZKbd>/</ZKbd> {{ tg('keySearch') }}
      </p>

      <GoodsTotalsBar
        :totals="totals"
        :stale="anyStale"
        :readonly="readonly"
        :loading="paymentsLoading"
        @calc-payments="emit('calc-payments')"
        @open="openItem"
      />
    </template>

    <ApplyToSelectedModal
      v-if="editable"
      v-model:open="applyOpen"
      :indexes="applyIndexes"
      :goods="items"
      :country-options="countryOptions ?? []"
      :direction="editorCtx.direction"
      :decl-procedure="editorCtx.declProcedure"
      @apply="onApply"
    />
    <GoodsExcelImportModal
      v-if="editable"
      v-model:open="excelOpen"
      v-model:mode="importMode"
      v-model:options="importOptions"
      :files="importFiles"
      :rows="importMerge?.rows ?? []"
      :built="importBuilt"
      :merge="importMerge"
      :plan="importPlan"
      :existing="items.length"
      :checking="importChecking"
      :sender-name="senderName"
      :origin-label="originLabel"
      @apply="applyImport"
      @add-file="pickExcel"
      @remove-file="removeImportFile"
    />

    <!-- Редактор открытого товара (?item=N): смонтирован только он. -->
    <GoodsEditor
      :model="model"
      :status-of="statusOf"
      :index="openIndex"
      :ctx="editorCtx"
      :readonly="readonly"
      :save-state="saveState"
      :return-focus="rowOpenButton"
      @close="closeItem"
      @step="itemRoute.step"
      @open="openItem"
    />
  </section>
</template>
