<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ZTable from '@/components/z/ZTable.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import type { ZTone } from '@/components/z/ZTag.vue'
import type { ZColumn, ZKey } from '@/ui/table'
import type { Import40GoodsItemInput } from '@/types/api'
import { formatTnved } from '@/utils/tnvedFormat'
import { formatKg, formatValue } from '@/views/broker/transit/record/sections/goods'
import { formatMoney, goodsTpin, type GoodsRow } from './goodsList'
import type { GoodsStatus } from './goodsStatus'

// Таблица товаров ДТ (доска DtGoods): чекбокс, №, код ТН ВЭД (моно; «нет кода» красным), описание · страна,
// брутто / нетто (в две строки), фактурная (валюта гр. 22 в заголовке), гр. 45 / ТПиН ₸ (в две строки), статус
// (точка + текст). Клик по строке (или кнопка кода с клавиатуры) — открыть товар. На телефоне — строки-карточки:
// № и код, описание, фактурная, статус. Строка лёгкая: только текст и точка статуса, без тяжёлых компонентов
// (200 товаров без виртуализации).
// Узкий раздел (1280 с панелью «До подачи» ≈ 580px, 1024 ≈ 620px, 1440 с панелью ≈ 740px) — без горизонтальной
// прокрутки: по ширине самой таблицы сначала уходят веса, потом гр. 45 / ТПиН (их суммы — в итогах и в редакторе),
// описанию остаётся не меньше ~160px.
const props = defineProps<{
  rows: GoodsRow[]
  statusOf: (g: Import40GoodsItemInput) => GoodsStatus
  /** Валюта гр. 22 — в заголовке «Фактурная»; без неё валюта — у каждой суммы. */
  currency: string | null
  readonly: boolean
  selectedKeys: number[]
  /** Ключ открытого товара — строка подсвечена. */
  openKey: number | null
  /** Код страны (ОКСМ) → буквенный (CN), если известен. */
  countryAlpha?: (code: string) => string | null
}>()
const emit = defineEmits<{ 'update:selectedKeys': [keys: number[]]; open: [index: number] }>()
const { t, locale } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.${key}`, p ?? {})

const dash = '—'
const kg = (n: number | null | undefined) => (typeof n === 'number' ? formatKg(n, locale.value) : dash)

// Ширина таблицы (не окна): раздел сужается панелью «До подачи». Пока не измерена (и в тестах) — все колонки.
const GOODS_WEIGHTS_MIN_WIDTH = 840
const GOODS_MONEY_MIN_WIDTH = 700
const tableRef = useTemplateRef<{ $el: HTMLElement }>('table')
const width = ref(Number.POSITIVE_INFINITY)
let ro: ResizeObserver | undefined
onMounted(() => {
  const el = tableRef.value?.$el
  if (!(el instanceof HTMLElement)) return
  const take = (w: number) => { width.value = w > 0 ? w : Number.POSITIVE_INFINITY }
  take(el.clientWidth)
  if (typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver((entries) => take(entries[0]?.contentRect.width ?? 0))
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

// Ширины: выбор 40 + № 36 + код 112 + фактурная 112 + статус 124 = 424; + гр. 45/ТПиН 112; + веса 100.
const columns = computed<ZColumn<GoodsRow>[]>(() => withCells([
  { key: 'n', title: tg('cols.n'), width: 36, className: 'px-2 text-ink-3 tabular-nums max-sm:hidden' },
  { key: 'code', title: tg('cols.code'), width: 112, className: 'px-2' },
  { key: 'description', title: tg('cols.description'), ellipsis: true },
  ...(width.value >= GOODS_WEIGHTS_MIN_WIDTH
    ? [{ key: 'weights', title: tg('cols.weights'), width: 100, align: 'right', className: 'py-1 tabular-nums max-sm:hidden' } as ZColumn<GoodsRow>]
    : []),
  {
    key: 'invoice',
    title: props.currency ? tg('cols.invoice', { currency: props.currency }) : tg('cols.invoiceBare'),
    width: 112,
    align: 'right',
    className: 'tabular-nums',
  },
  ...(width.value >= GOODS_MONEY_MIN_WIDTH
    ? [{ key: 'money', title: tg('cols.money'), width: 112, align: 'right', className: 'py-1 tabular-nums max-sm:hidden' } as ZColumn<GoodsRow>]
    : []),
  { key: 'status', title: tg('cols.status'), width: 124, fixed: 'right' },
]))

const statusView = (s: GoodsStatus): { tone: ZTone; label: string } => {
  if (s.kind === 'missing') return { tone: 'danger', label: tg('status.missing', { n: s.count }) }
  if (s.kind === 'badCode') return { tone: 'danger', label: tg('status.badCode') }
  if (s.kind === 'stale') return { tone: 'accent', label: tg('status.stale') }
  return { tone: 'done', label: tg('status.ready') }
}

// Статусы — один раз на отрисовку (по ключу товара), а не по вызову на ячейку.
const statusByKey = computed(() => new Map(props.rows.map((r) => [r.key, props.statusOf(r.item)])))

// Открыть товар: кнопка в ячейке кода — её имя читается вместе с кодом («8471 30 000 0, открыть товар 1»),
// а содержимое строки остаётся читаемым (без aria-label на <tr>). Клик по любой ячейке строки — тоже открыть.
const openButton = 'cursor-pointer rounded-field border-0 bg-transparent p-0 text-left font-[inherit] text-inherit outline-hidden focus-visible:shadow-focus'
const srOpen = (n: number) => h('span', { class: 'sr-only' }, `, ${tg('openItem', { n })}`)

// Две величины в одной ячейке: первая — основная, вторая — мельче и тише (брутто / нетто, гр. 45 / ТПиН).
const stacked = (top: string, bottom: string) => h('span', { class: 'flex flex-col leading-tight' }, [
  h('span', null, top),
  h('span', { class: 'text-xs text-ink-3' }, bottom),
])

// Ячейки — рендер-функциями (без компонента на ячейку): так 200 строк остаются дешёвыми.
const cell = (key: string | undefined, r: GoodsRow) => {
  const g = r.item
  switch (key) {
    case 'n':
      return String(r.index + 1)
    case 'code': {
      // Карточка на телефоне — с номером товара (колонка «№» там скрыта).
      const no = h('span', { class: 'mr-1.5 text-ink-3 tabular-nums sm:hidden', 'aria-hidden': 'true', 'data-goods-card-n': '' }, `№ ${r.index + 1}`)
      const btn = g.tnvedCode
        ? h('button', {
          type: 'button',
          // Кода нет в справочнике — красным, как «нет кода».
          class: [openButton, 'font-mono text-[12px] whitespace-nowrap', statusByKey.value.get(r.key)?.kind === 'badCode' ? 'text-danger' : 'text-ink'],
          'data-goods-code': '',
          'data-goods-open': '',
        },
          [formatTnved(g.tnvedCode), srOpen(r.index + 1)])
        : h('button', { type: 'button', class: [openButton, 'text-[13px] text-danger'], 'data-goods-no-code': '', 'data-goods-open': '' },
          [tg('noCode'), srOpen(r.index + 1)])
      return [no, btn]
    }
    case 'description': {
      const text = g.description || g.tnvedDescription || dash
      const c = (g.countryOfOrigin ?? '').trim()
      const country = c ? (props.countryAlpha?.(c) ?? c) : ''
      return h('span', { class: 'flex min-w-0 items-baseline gap-1.5' }, [
        h('span', { class: 'truncate' }, text),
        country ? h('span', { class: 'shrink-0 font-mono text-[11px] text-muted' }, country) : null,
      ])
    }
    case 'weights':
      return stacked(kg(g.grossWeightKg), kg(g.netWeightKg))
    case 'invoice': {
      if (typeof g.customsValue !== 'number') return dash
      const v = formatMoney(g.customsValue, locale.value)
      return props.currency || !g.currency ? v : `${v} ${g.currency}`
    }
    case 'money': {
      const tpin = goodsTpin(g)
      return stacked(
        typeof g.customsValueKzt === 'number' ? formatValue(g.customsValueKzt, locale.value) : dash,
        tpin == null ? dash : formatValue(tpin, locale.value),
      )
    }
    case 'status': {
      const st = statusByKey.value.get(r.key) ?? props.statusOf(g)
      const s = statusView(st)
      return h(StatusDot, { tone: s.tone, label: s.label, 'data-goods-status': st.kind })
    }
  }
  return null
}

function withCells(cols: ZColumn<GoodsRow>[]): ZColumn<GoodsRow>[] {
  return cols.map((c) => ({ ...c, customRender: ({ record }) => cell(c.key, record) }))
}

const rowSelection = computed(() => (props.readonly
  ? undefined
  : {
      selectedRowKeys: props.selectedKeys as ZKey[],
      onChange: (keys: ZKey[]) => emit('update:selectedKeys', keys.map(Number)),
    }))

// Клик по строке (и Enter/Space на кнопке кода — это тоже click) открывает товар.
const customRow = (r: GoodsRow) => ({
  'data-goods-row': r.index,
  'data-open': r.key === props.openKey || undefined,
  class: 'cursor-pointer',
  onClick: () => emit('open', r.index),
})
const rowClassName = (r: GoodsRow) => (r.key === props.openKey ? 'bg-zircon-soft' : '')
</script>

<template>
  <ZTable
    ref="table"
    :columns="columns"
    :data-source="rows"
    row-key="key"
    :pagination="false"
    :row-selection="rowSelection"
    :custom-row="customRow"
    :row-class-name="rowClassName"
    :aria-label="tg('tableLabel')"
    class="overflow-hidden rounded-panel border border-line max-sm:overflow-visible max-sm:border-0"
    data-goods-table
  >
  </ZTable>
</template>
