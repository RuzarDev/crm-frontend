<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhPlus, PhUploadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import { chipFrame, chipTrigger } from '@/components/broker/chipStyles'
import type { ReestrGoodsItemInput } from '@/types/api'
import { confirmState, useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { GOODS_EXCEL_ACCEPT, GOODS_EXCEL_MESSAGES, isExcelFileName, readGoodsExcel } from '@/utils/goodsExcel'
import ApplyToSelectedModal from './ApplyToSelectedModal.vue'
import GoodsBulkBar from './GoodsBulkBar.vue'
import GoodsExcelImportModal from './GoodsExcelImportModal.vue'
import GoodsTable from './GoodsTable.vue'
import GoodsTotalsBar from './GoodsTotalsBar.vue'
import type { BulkPatch } from './goodsBulk'
import { exportGoodsXlsx } from './goodsExport'
import { dtGoodsFromExcel } from './goodsImport'
import { filterGoods, formatItemNumbers, goodsTotals, type GoodsFilter } from './goodsList'
import { goodsPaymentsStale } from './goodsStatus'
import { keyOf, type DtGoodsModel } from './useDtGoods'
import { useGoodsItemRoute } from './useGoodsItemRoute'

// Раздел «Товары» страницы ДТ (волна 6б, доска DtGoods): заголовок «Товары N · гр. 31–46», поиск (`/`), фильтры
// «С ошибками · N» и «Пересчитать · N», «Из Excel» (с предпросмотром), «В Excel», «Добавить товар» (N); таблица
// со статусами и выбором строк, тёмная панель массовых действий; итоги закреплены внизу раздела с «Рассчитать».
// Товары правятся на месте через модель useDtGoods (одна на страницу); открытый товар — в адресе `?item=N`
// (useGoodsItemRoute). Редактор товара — Task 3; пока — заглушка-панель «Товар N из M».
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
}>()
const emit = defineEmits<{ 'calc-payments': []; 'calc-tpin': [] }>()
const { t } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.${key}`, p ?? {})
const { confirm } = useConfirm()

const items = computed(() => props.model.items.value)
const editable = computed(() => !props.readonly)

// ---- Поиск и фильтры ----
const query = ref('')
const filter = ref<GoodsFilter>(null)
const rows = computed(() => filterGoods(items.value, { query: query.value, filter: filter.value, statusOf: props.model.statusOf }))
const counts = computed(() => props.model.counts.value)
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
const editorOpen = computed(() => openIndex.value != null)
const onEditorOpen = (v: boolean) => { if (!v) void closeItem() }

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
  const n = props.model.applyToSelected(selectedIndexes.value, patch)
  applyOpen.value = false
  message.success(tg('apply.done', { n }))
}

// ---- Из Excel / В Excel ----
const fileInput = ref<HTMLInputElement | null>(null)
const excelBusy = ref(false)
const excelOpen = ref(false)
const excelFile = ref('')
const excelRows = shallowRef<ReestrGoodsItemInput[]>([])
const pickExcel = () => { if (editable.value) fileInput.value?.click() }
const onFile = async (e: Event) => {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  if (!isExcelFileName(file.name)) {
    message.error(t('dt.dopustimTolkoExcel'))
    return
  }
  excelBusy.value = true
  try {
    const result = await readGoodsExcel(file)
    if ('problem' in result) {
      message.warning(t(GOODS_EXCEL_MESSAGES[result.problem]))
      return
    }
    excelFile.value = file.name
    excelRows.value = result.goods
    excelOpen.value = true
  } catch (err) {
    console.error('Failed to import goods from Excel', err)
    message.error(t('dt.neUdalosProchitatFayl'))
  } finally {
    excelBusy.value = false
  }
}
const appendExcel = () => {
  const n = props.model.append(dtGoodsFromExcel(excelRows.value, { currency: props.currency }))
  excelOpen.value = false
  excelRows.value = []
  if (n) message.success(tg('excel.done', { n }))
}

const exporting = ref(false)
const exportExcel = async () => {
  if (!items.value.length) return
  exporting.value = true
  try {
    await exportGoodsXlsx(items.value, (k) => t(k), props.dtNumber)
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
  if (e.key === '/') {
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
const openTitle = computed(() => (openIndex.value == null ? '' : tg('editor.title', { n: openIndex.value + 1, m: items.value.length })))
const openGoods = computed(() => (openIndex.value == null ? null : items.value[openIndex.value] ?? null))

defineExpose({ openItem, closeItem, step: itemRoute.step, openIndex, focusSearch })
</script>

<template>
  <section class="flex min-w-0 flex-col gap-3" data-dt-goods data-graph="31">
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
        <input ref="fileInput" type="file" class="hidden" tabindex="-1" aria-hidden="true" :accept="GOODS_EXCEL_ACCEPT" data-goods-excel-input @change="onFile">
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
        :status-of="model.statusOf"
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
        @calc-tpin="emit('calc-tpin')"
      />
    </template>

    <ApplyToSelectedModal
      v-if="editable"
      v-model:open="applyOpen"
      :indexes="applyIndexes"
      :goods="items"
      :country-options="countryOptions ?? []"
      @apply="onApply"
    />
    <GoodsExcelImportModal
      v-if="editable"
      v-model:open="excelOpen"
      :file-name="excelFile"
      :rows="excelRows"
      :existing="items.length"
      @append="appendExcel"
    />

    <!-- Редактор товара — Task 3; пока панель-заглушка с номером товара. -->
    <ZDrawer :open="editorOpen" :title="openTitle" :width="780" data-dt-goods-editor @update:open="onEditorOpen">
      <div v-if="openGoods" class="flex flex-col gap-2 text-sm" :data-goods-index="openIndex">
        <p class="m-0 font-mono text-ink">{{ openGoods.tnvedCode || tg('noCode') }}</p>
        <p class="m-0 text-ink-2">{{ openGoods.description || '—' }}</p>
        <p class="m-0 text-xs text-muted">{{ tg('editor.placeholder') }}</p>
      </div>
    </ZDrawer>
  </section>
</template>
