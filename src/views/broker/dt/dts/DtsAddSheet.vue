<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalculator, PhCaretRight } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { DtsDocRef, DtsGoodsColumn, DtsSheet } from '@/api/dts'
import { vUppercase } from '@/directives/uppercase'
import { cn } from '@/ui/cn'
import { formatDateText } from '@/ui/date'
import { formatNumberIn } from '@/ui/number'
import type { DtFormState } from '../dtPayload'

// Добавочный лист ДТС (гр. 11–25; доска DtDts): товары — строками (удобно и при 100+ товарах), колонки 11а в валюте,
// 12, Σ13–19, Σ21–23, 25а ₸, 25б USD и гр. 45 ДТ; «не совпадает» — гр. 45 ДТ ≠ гр. 25а ДТС (до копейки — сервер).
// Строка раскрывается в статьи (13а…23 с названиями из справочника расходов) и пересчёт валют. Всё — с сервера,
// по сохранённой ДТ. Правится только «Место для гр. 17» (форма ДТ). «Пересчитать гр. 45» — у строки «не совпадает»
// и общей кнопкой: шаг 1 расчёта платежей (страница), а не копия гр. 25. ДТС-2: в раскрытой строке — документы о
// стоимости товара для гр. 8 (04051) или что их нет. На телефоне строки — карточки.
const props = defineProps<{
  sheet: DtsSheet
  form: DtFormState
  readonly: boolean
  /** Номера товаров (с 1), у которых гр. 45 ДТ ≠ гр. 25а ДТС. */
  mismatch: ReadonlySet<number>
  /** Код статьи расхода → название (справочник расходов страницы). */
  expenseLabels: Record<string, string>
  recalcLoading: boolean
}>()
const emit = defineEmits<{ recalc: [] }>()
const { t, locale } = useI18n()
const ts = (key: string, p?: Record<string, unknown>) => t(`broker.dt.dts.sheet.${key}`, p ?? {})

const ADDITION_ORDER = ['13a', '13b', '14a', '14b', '14c', '14d', '15', '16', '17', '18', '19']
const DEDUCTION_ORDER = ['21', '22', '23']
const ordered = (rec: Record<string, number>, order: string[]) =>
  [...order.filter((c) => c in rec), ...Object.keys(rec).filter((c) => !order.includes(c)).sort()]
const sum = (rec: Record<string, number>) => Object.values(rec ?? {}).reduce((a, b) => a + (b ?? 0), 0)

const kzt0 = (n: number | null | undefined) => (n == null ? '—' : formatNumberIn(locale.value, n, 0, 0))
const money2 = (n: number | null | undefined) => (n == null ? '—' : formatNumberIn(locale.value, n, 2, 2))

// Название товара — из формы, только если на той же позиции тот же код (лист — по сохранённой ДТ: после
// несохранённой перестановки подпись другого товара не покажем).
const nameOf = (g: DtsGoodsColumn): string => {
  const fg = props.form.goodsItems[g.number - 1]
  if (!fg) return ''
  const same = (fg.tnvedCode ?? '').trim() === (g.tnvedCode ?? '').trim()
  return same ? (fg.description ?? '').trim() : ''
}

const rows = computed(() => (props.sheet.goods ?? []).map((g) => {
  const off = props.mismatch.has(g.number)
  // Расхождение до копейки: в строке «не совпадает» 25а и гр. 45 — с копейками, иначе разница не видна.
  const kzt = off ? money2 : kzt0
  return {
    g,
    off,
    name: nameOf(g),
    cells: [
      { key: '11a', label: ts('col11a'), text: `${money2(g.invoicePrice)} ${g.invoiceCurrency ?? ''}`.trim() },
      { key: '12', label: ts('col12'), text: kzt0(g.box12) },
      { key: '13', label: ts('col13'), text: kzt0(sum(g.additions)) },
      { key: '21', label: ts('col21'), text: kzt0(sum(g.deductions)) },
      { key: '25a', label: ts('col25a'), text: kzt(g.box25Kzt) },
      { key: '25b', label: ts('col25b'), text: money2(g.box25Usd) },
      { key: '45', label: ts('col45'), text: kzt(g.declaredCustomsValueKzt), danger: off },
    ],
  }
}))

const expanded = ref(new Set<number>())
const toggle = (n: number) => {
  const next = new Set(expanded.value)
  if (next.has(n)) next.delete(n)
  else next.add(n)
  expanded.value = next
}

const articleLabel = (code: string) => {
  const name = props.expenseLabels[code]
  return name ? `${code} · ${name}` : code
}
const details = (g: DtsGoodsColumn) => [
  { key: '11a', label: ts('box11aKzt'), value: money2(g.invoicePriceKzt) },
  { key: '12', label: ts('box12'), value: money2(g.box12) },
  ...ordered(g.additions ?? {}, ADDITION_ORDER).map((c) => ({ key: `a${c}`, label: articleLabel(c), value: money2(g.additions[c]) })),
  { key: '20', label: ts('box20'), value: money2(g.box20) },
  ...ordered(g.deductions ?? {}, DEDUCTION_ORDER).map((c) => ({ key: `d${c}`, label: articleLabel(c), value: money2(g.deductions[c]) })),
  { key: '24', label: ts('box24'), value: money2(g.box24) },
  { key: '25a', label: ts('box25a'), value: money2(g.box25Kzt) },
  { key: '25b', label: ts('box25b'), value: money2(g.box25Usd) },
  { key: '45', label: ts('box45'), value: money2(g.declaredCustomsValueKzt) },
]
const currencyLines = (g: DtsGoodsColumn) => (g.currencyLines ?? []).map((l) =>
  ts('currencyLine', { box: articleLabel(l.box), amount: money2(l.amount), currency: l.currency, rate: formatNumberIn(locale.value, l.rate, 4) }))

// ДТС-2: документы о стоимости (гр. 8) по номеру товара.
const form2 = computed(() => props.sheet.formCode === 2)
const evidenceBy = computed(() => new Map((props.sheet.evidence ?? []).map((e) => [e.goodsNumber, e.docs])))
const docText = (d: DtsDocRef) => {
  const head = `${d.kindCode} · ${d.number}`
  return d.date ? t('broker.dt.dts.main.docLine', { number: head, date: formatDateText(d.date) }) : head
}

const th = 'border-b border-line bg-canvas px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap text-ink-3'
const td = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap max-sm:flex max-sm:flex-col max-sm:items-start max-sm:gap-0.5 max-sm:px-0 max-sm:py-1 max-sm:text-left'
</script>

<template>
  <section class="flex flex-col gap-4" data-dts-sheet>
    <h3 class="m-0 flex items-baseline gap-2 text-[14px] font-semibold text-ink">
      {{ ts('title') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '11–25' }) }}</span>
    </h3>

    <ZField class="max-w-md" :label="ts('place')" :extra="ts('placeHint')" data-dts-place-field>
      <ZInput
        v-uppercase
        :value="form.dtsPlaceName"
        :disabled="readonly"
        :placeholder="form.incotermsPlace || ts('placePlaceholder')"
        data-dts-place
        @update:value="form.dtsPlaceName = $event || null"
      />
    </ZField>

    <p v-if="!rows.length" class="m-0 rounded-row bg-canvas px-4 py-3 text-sm text-muted" data-dts-sheet-empty>{{ ts('empty') }}</p>
    <div v-else class="overflow-x-auto rounded-row border border-line max-sm:overflow-visible max-sm:border-0">
      <table class="w-full border-collapse text-sm max-sm:block" :aria-label="ts('title')">
        <thead class="max-sm:hidden">
          <tr>
            <th scope="col" :class="cn(th, 'text-left')">{{ ts('goods') }}</th>
            <th v-for="c in rows[0].cells" :key="c.key" scope="col" :class="th">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody class="max-sm:flex max-sm:flex-col max-sm:gap-2">
          <template v-for="r in rows" :key="r.g.number">
            <tr
              :class="cn(
                'border-t border-line first:border-t-0 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:rounded-row max-sm:border max-sm:p-3',
                r.off && 'bg-tone-danger-bg/50',
              )"
              :data-goods-index="r.g.number - 1"
              :data-dts-row="r.g.number"
              :data-mismatch="r.off || undefined"
            >
              <th scope="row" class="px-3 py-2 text-left font-normal max-sm:col-span-2 max-sm:px-0 max-sm:py-0" data-graph="ДТС">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button
                    type="button"
                    class="inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-1 text-left font-sans text-sm text-ink outline-hidden hover:text-zircon-ink focus-visible:shadow-focus max-sm:min-h-11"
                    :aria-expanded="expanded.has(r.g.number)"
                    :aria-controls="`dts-goods-${r.g.number}`"
                    :aria-label="ts('details', { n: r.g.number })"
                    data-dts-expand
                    @click="toggle(r.g.number)"
                  >
                    <PhCaretRight :size="13" aria-hidden="true" :class="cn('shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none', expanded.has(r.g.number) && 'rotate-90')" />
                    <span class="tabular-nums">{{ r.g.number }}</span>
                    <span class="text-muted">·</span>
                    <span class="max-w-[16rem] truncate">{{ r.name || r.g.tnvedCode || '—' }}</span>
                  </button>
                  <ZTag v-if="r.off" tone="danger" size="sm" :title="ts('mismatchHint')" data-dts-mismatch>{{ ts('mismatch') }}</ZTag>
                  <ZButton v-if="r.off && !readonly" variant="link" size="sm" class="max-sm:h-11" :disabled="recalcLoading" data-dts-row-recalc @click="emit('recalc')">
                    {{ ts('recalc') }}
                  </ZButton>
                </div>
              </th>
              <td v-for="c in r.cells" :key="c.key" :class="cn(td, c.danger && 'font-semibold text-danger')" :data-dts-cell="c.key">
                <span class="text-xs font-normal text-muted sm:hidden">{{ c.label }}</span>{{ c.text }}
              </td>
            </tr>
            <tr v-if="expanded.has(r.g.number)" :id="`dts-goods-${r.g.number}`" class="max-sm:block" :data-dts-details="r.g.number">
              <td :colspan="r.cells.length + 1" class="border-t border-line bg-canvas px-4 py-3 max-sm:block max-sm:rounded-row max-sm:border-0">
                <dl class="m-0 gap-x-8 sm:columns-2 lg:columns-3">
                  <div v-for="d in details(r.g)" :key="d.key" class="flex break-inside-avoid justify-between gap-3 py-0.5 text-[13px]" :data-dts-article="d.key">
                    <dt class="min-w-0 text-ink-3">{{ d.label }}</dt>
                    <dd class="m-0 tabular-nums text-ink">{{ d.value }}</dd>
                  </div>
                </dl>
                <div v-if="form2" class="mt-3 text-[13px]" data-dts-evidence>
                  <p class="m-0 text-xs font-semibold text-ink-2">{{ ts('evidence') }}</p>
                  <ul v-if="evidenceBy.get(r.g.number)?.length" class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 font-mono text-ink">
                    <li v-for="(d, i) in evidenceBy.get(r.g.number)" :key="i">{{ docText(d) }}</li>
                  </ul>
                  <p v-else class="m-0 mt-1 text-danger">{{ ts('noEvidence') }}</p>
                </div>
                <template v-if="r.g.currencyLines?.length">
                  <p class="m-0 mt-3 text-xs font-semibold text-ink-2">{{ ts('currency') }}</p>
                  <ul class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 text-[13px] text-ink-2" data-dts-currency>
                    <li v-for="(line, i) in currencyLines(r.g)" :key="i">{{ line }}</li>
                  </ul>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="rows.length && !readonly" class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2" data-dts-recalc-wrap>
      <p class="m-0 min-w-0 flex-1 text-xs text-muted max-sm:basis-full">{{ ts('recalcHint') }}</p>
      <ZButton class="max-sm:h-11 max-sm:w-full" :loading="recalcLoading" data-dts-recalc @click="emit('recalc')">
        <PhCalculator :size="16" aria-hidden="true" />{{ ts('recalc') }}
      </ZButton>
    </div>
  </section>
</template>
