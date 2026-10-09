<!-- crm-frontend/src/components/Import40GoodsKedenPanel.vue -->
<template>
  <div class="keden-panel">
    <div class="section-bar">
      <span class="section-label">{{ t('dt.dannyeKedenPoTovaram') }}</span>
      <div class="header-buttons">
        <a-button v-if="!readonly && items.length > 1" size="small" @click="applyMonthsToAll"> {{ t('dt.prostavitMesyacyVsemTovaram') }} </a-button>
        <a-button v-if="!readonly" size="small" @click="emit('calc-tpin')">{{ t('dt.rasschitatTpinAvto') }}</a-button>
      </div>
    </div>

    <!-- «Сумма граф» (правка Ирины): всегда видимая полоса итогов по всем товарам. -->
    <div v-if="items.length" class="decl-sum-strip">
      <span class="decl-sum-title">{{ t('dt.summaGraf') }}</span>
      <div class="decl-sum-items">
        <div class="decl-sum-item"><span>{{ t('dt.brutto') }}</span><b>{{ fmtAmount(declTotals.brutto) }} {{ t('dt.kg') }}</b></div>
        <div class="decl-sum-item"><span>{{ t('dt.netto') }}</span><b>{{ fmtAmount(declTotals.netto) }} {{ t('dt.kg') }}</b></div>
        <div class="decl-sum-item"><span>{{ t('dt.mest') }}</span><b>{{ fmtInt(declTotals.places) }}</b></div>
        <div class="decl-sum-item"><span>{{ t('dt.stoimost') }}</span><b>{{ fmtAmount(declTotals.value) }}</b></div>
        <div class="decl-sum-item decl-sum-item--accent"><span>{{ t('dt.tpin') }}</span><b>{{ fmtAmount(declTotals.tpin) }} ₸</b></div>
      </div>
    </div>

    <!-- Построчная таблица гр.47 убрана (аудит дизайна 01.10): строки платежей видны и правятся в карточке
         каждого товара, а здесь повторяли те же суммы. Итоги по видам платежа — в блоке гр.В ниже. -->
    <div v-if="items.length && !paymentsSummaryRows.length" class="empty-state payments-summary-empty"> {{ t('dt.platezhiGr47NeRasschitany') }} </div>
    <!-- Гр.В (правка Ирины): всегда видимый блок общих платежей по декларации
         за все товары — суммы по кодам + итог. -->
    <div v-if="grVTotals.rows.length" class="gr-v-block">
      <div class="section-bar"><span class="section-label">{{ t('dt.grvObschiePlatezhiPo') }}</span></div>
      <div class="gr-v-rows">
        <div v-for="r in grVTotals.rows" :key="r.code" class="gr-v-row">
          <span class="gr-v-code">{{ r.code }}</span>
          <span class="gr-v-name">{{ r.label }}</span>
          <b class="gr-v-amount">{{ fmtAmount(r.amount) }} ₸</b>
        </div>
        <div class="gr-v-row gr-v-total">
          <span class="gr-v-name">{{ t('dt.itogoGrv') }}</span>
          <b class="gr-v-amount">{{ fmtAmount(grVTotals.total) }} ₸</b>
        </div>
      </div>
    </div>

    <!-- Гр.B (детализация): строки "{код}-{сумма}-398-{дата}-БН" из последнего
         calculate-payments — читаемая расшифровка того, что записано в гр.B. -->
    <div v-if="bLineRows.length" class="b-line-block">
      <span class="b-line-label">{{ t('dt.grbDetalizaciya') }}</span>
      <span class="b-line-value">{{ bLineRows.join('; ') }}</span>
    </div>

    <!-- Поля по каждому товару (упаковка, преференции, процедура, стоимости, ОИС,
         маркировка, платежи) переехали в карточку товара — Import40GoodsKedenFields,
         см. DtSectionGoods. Здесь остаются только сводные итоги по декларации. -->
    <div v-if="!items.length" class="empty-state">{{ t('dt.snachalaDobavteTovary') }}</div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { CloseOutlined, QuestionCircleOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { message } from '@/ui/message'
import { loadXlsx } from '@/utils/xlsx'
import type { Import40GoodsItemInput, Import40GoodsPayment, Import40GoodsMarking } from '@/types/api'
import { cloneGoodsExtras } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40GoodsItemInput[]
  readonly?: boolean
  // гр.19: показываем поле «Номер контейнера» (гр.31.3) только при контейнерных
  // перевозках — иначе поле не заполняется и загромождает панель.
  containerIndicator?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Import40GoodsItemInput[]): void
  (e: 'calc-tpin'): void
}>()

const items = computed(() => props.modelValue)

// «Вид упаковки» и селекты платежей гр.47 живут внутри вложенных a-collapse-panel
// (карточка товара -> подсекция платежей), и их выпадающая панель рендерилась в
// контейнер, обрезаемый анимацией/overflow сворачиваемых панелей — из-за этого
// декларант видела исчезающий/пустой попап при клике. Рендерим попап в body,
// вне зоны обрезки.
const popupContainer = () => document.body

// гр.46 (Item I): пустую заполняет страница ДТ (dtGoodsRules.goodsWithStatUsd) — и когда раздел не открыт;
// пересчёт по правке гр.45 — в карточке товара (Import40GoodsKedenFields).

// Русские названия видов платежа гр.47 (см. tax-modes в DatabaseExtensions.cs
// на бэке) — для явной, не-кодовой подписи в сводной таблице ниже.
const TAX_MODE_LABELS = computed((): Record<string, string> => ({

  '2010': t('dt.poshlina'),
  '4010': t('dt.akciz'),
  '1010': t('dt.sbor'),
  '5060': t('dt.nds'),
}))
// Акциз — любой код 4xxx (в КЕДЕН по виду товара: 4420, 4400…).
const taxModeLabel = (code: string | null | undefined) =>
  code ? (TAX_MODE_LABELS.value[code] ?? (/^4\d{3}$/.test(code) ? `${t('dt.akciz')} ${code}` : code)) : '—'

// Порядок гр.47 в отображении: Сборы (1010) → Пошлина (2010) → НДС (5060) → прочие,
// как их уже отдаёт backend calculate-payments (Task 3) — сортируем то же самое, что
// пришло в g.payments, чтобы визуальный порядок совпадал с ответом расчёта.
const TAX_MODE_PRIORITY: Record<string, number> = { '1010': 0, '2010': 1, '5060': 2 }
const taxModePriority = (code: string | null | undefined) =>
  code != null && code in TAX_MODE_PRIORITY ? TAX_MODE_PRIORITY[code] : 99

const sortedPayments = (g: Import40GoodsItemInput): Import40GoodsPayment[] =>
  [...(g.payments ?? [])].sort((a, b) => taxModePriority(a.taxModeCode) - taxModePriority(b.taxModeCode))

// Task 6 (follow-ups): применённый пониженный НДС (5%) — display-only, без пересчёта
// на клиенте. Источник истины — гр.47/5060 (НДС) с последнего расчёта (rateLabel
// начинается с "5%": сервер сам определяет ставку по коду ТНВЭД, см. Import40PaymentCalculator
// Task 5) ЛИБО ручной флаг vatRatePreferential=0.05 (переключатель «Медизделие»,
// см. DtPaymentsCalcModal / useDtPayments), пока расчёт ещё не проведён. Если нет ни
// того, ни другого — бейдж не показываем (не гадаем).
const hasReducedVat = (g: Import40GoodsItemInput): boolean => {
  if (g.vatRatePreferential === 0.05) return true
  const vatPayment = (g.payments ?? []).find((p) => p.taxModeCode === '5060')
  return !!vatPayment?.rateLabel?.startsWith('5%')
}

interface PaymentsSummaryRow {
  key: string
  goods: string
  taxMode: string
  base: number | null
  rate: number | null
  amount: number | null
  // Task 10: подписи из calculate-payments (basisLabel/rateLabel/паспорт СП) —
  // приоритет над числовыми base/rate в отображении (см. bodyCell в шаблоне).
  basisLabel: string | null
  rateLabel: string | null
  featureCode: string | null
}

// Task 10, №9: колонки гр.47 — Вид / Основа начисления / Ставка / Сумма / СП
// (мнемоника формы — "способ платежа" гр.47).
const paymentsSummaryColumns = computed(() => ([

  { title: t('dt.tovarWord'), dataIndex: 'goods', key: 'goods', width: 220, ellipsis: true },
  { title: t('dt.vid'), dataIndex: 'taxMode', key: 'taxMode', width: 120 },
  { title: t('dt.osnovaNachisleniya'), dataIndex: 'base', key: 'base', width: 150 },
  { title: t('dt.stavka'), dataIndex: 'rate', key: 'rate', width: 130 },
  { title: t('dt.summa'), dataIndex: 'amount', key: 'amount', width: 140 },
  { title: t('dt.sp'), dataIndex: 'featureCode', key: 'sp', width: 70 },
]))
const fmtAmount = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v: number) => v.toLocaleString('ru-RU')

// «Сумма граф» (правка Ирины): итоги по всем товарам — вес брутто/нетто, места,
// фактурная стоимость, ТПиН (сумма всех платежей гр.47). Считаем на лету.
const declTotals = computed(() => {
  let brutto = 0, netto = 0, places = 0, value = 0, tpin = 0
  for (const g of items.value) {
    brutto += Number(g.grossWeightKg) || 0
    netto += Number(g.netWeightKg) || 0
    places += Number(g.packagesCount) || 0
    value += Number(g.customsValue) || 0
    for (const p of g.payments ?? []) tpin += Number(p.amountKzt) || 0
  }
  return {
    brutto: Math.round(brutto * 1000) / 1000,
    netto: Math.round(netto * 1000) / 1000,
    places,
    value: Math.round(value * 100) / 100,
    tpin: Math.round(tpin * 100) / 100,
  }
})

// Гр.В (правка Ирины): общие платежи по декларации за все товары — суммы по кодам
// (1010/2010/5060…) + итог гр.В. Агрегируем g.payments по taxModeCode.
const grVTotals = computed(() => {
  const byCode: Record<string, number> = {}
  for (const g of items.value) {
    for (const p of g.payments ?? []) {
      if (!p.taxModeCode) continue
      byCode[p.taxModeCode] = (byCode[p.taxModeCode] ?? 0) + (Number(p.amountKzt) || 0)
    }
  }
  const rows = Object.entries(byCode)
    .map(([code, amount]) => ({ code, label: taxModeLabel(code), amount }))
    .sort((a, b) => (TAX_MODE_PRIORITY[a.code] ?? 99) - (TAX_MODE_PRIORITY[b.code] ?? 99))
  const total = rows.reduce((acc, r) => acc + r.amount, 0)
  return { rows, total: Math.round(total * 100) / 100 }
})

// Task 10, №13: при временном ввозе фактическая сумма — это 3%×мес от "обычной"
// (нормальной) суммы, а RateLabel с бэка остаётся НОМИНАЛЬНОЙ адвалорной ставкой
// (см. Import40PaymentCalculator.cs) — без этой пометки декларант видит, например,
// "12.5%" рядом с суммой, посчитанной по факту как 12.5%×3%×3мес, и это выглядит
// как ошибка расчёта. Аннотируем только 2010 (пошлина) и 5060 (НДС) — временный
// ввоз условно начисляет именно их (сбор 1010 — без изменений, целиком).
const TEMP_IMPORT_ANNOTATED_CODES = new Set(['2010', '5060'])
const annotateRateLabel = (
  taxModeCode: string | null | undefined,
  rateLabel: string | null,
  tempImportMonths: number | null | undefined,
): string | null => {
  if (!rateLabel || !tempImportMonths || !taxModeCode || !TEMP_IMPORT_ANNOTATED_CODES.has(taxModeCode)) {
    return rateLabel
  }
  return t('dt.ratelabel3TempimportmonthsMes', { label: rateLabel, months: tempImportMonths })
}

const paymentsSummaryRows = computed<PaymentsSummaryRow[]>(() => {
  const rows: PaymentsSummaryRow[] = []
  items.value.forEach((g, gi) => {
    sortedPayments(g).forEach((p, pi) => {
      rows.push({
        key: `${gi}-${pi}`,
        goods: t('dt.tovarGi1G', { n: gi + 1, code: g.tnvedCode || t('dt.bezKoda'), desc: g.description || '' }),
        taxMode: taxModeLabel(p.taxModeCode),
        base: p.taxBase ?? null,
        rate: p.rateValue ?? null,
        amount: p.amountKzt ?? null,
        basisLabel: p.basisLabel ?? null,
        rateLabel: annotateRateLabel(p.taxModeCode, p.rateLabel ?? null, g.tempImportMonths),
        featureCode: p.paymentFeatureCode ?? null,
      })
    })
  })
  return rows
})

// Task 10, №2: детализация гр.B ("{код}-{сумма}-398-{дата}-БН") по всем строкам
// всех товаров — из последнего calculate-payments (bLine пишется в g.payments
// при "Записать в гр.47 и гр.B" в модалке расчёта, см. applyGoodsPaymentRows в views/broker/dt/useDtPayments.ts).
const bLineRows = computed<string[]>(() =>
  items.value.flatMap((g) => (g.payments ?? []).map((p) => p.bLine).filter((v): v is string => !!v)),
)

// ВАЖНО: эмитим НОВЫЙ массив с копиями объектов. ReestrGoodsSection выше по форме
// держит внутренние копии строк и пересинхронизируется только по watch на modelValue;
// эмит той же ссылки не триггерит watch — его копии остались бы без КЕДЕН-правок,
// и следующее редактирование товара там откатило бы поля этой панели.
const sync = () =>
  emit(
    'update:modelValue',
    props.modelValue.map((g) => ({
      ...g,
      payments: (g.payments ?? []).map((p) => ({ ...p })),
      markings: (g.markings ?? []).map((m) => ({ ...m })),
      extras: cloneGoodsExtras(g.extras),
    })),
  )

const classifiers = useClassifiersStore()
const pkgOptions = computed(() => classifiers.options('2013'))
const prefOptions = computed(() => classifiers.options('2008'))
const taxModeOptions = computed(() => classifiers.options('tax-modes'))
const rateKindOptions = computed(() => classifiers.options('rate-kinds'))
const valuationOptions = computed(() => classifiers.options('2005'))
const procOptions = computed(() => classifiers.options('customs-procedures'))
const moveFeatureOptions = computed(() => classifiers.options('movement-features'))
const packagingAvailabilityOptions = computed(() => classifiers.options('packaging-availability'))
const oisIndicatorOptions = computed(() => classifiers.options('ois-indicators'))
const restrictionMarksOptions = computed(() => classifiers.options('restriction-marks'))

// g.restrictionMarks хранится строкой CSV («С,М,П»), т.к. так задан контракт бэка
// (Task 1); UI — multi-select, поэтому туда/обратно конвертируем через запятую.
const restrictionMarksArray = (g: Import40GoodsItemInput): string[] =>
  (g.restrictionMarks ?? '').split(',').map((s) => s.trim()).filter(Boolean)

// Полная подпись признака по коду — для tooltip на компактном теге (в теге только
// код, иначе длинные подписи перекрывают соседние поля гр.33).
const restrictionMarkLabel = (code: string): string =>
  restrictionMarksOptions.value.find((o) => o.value === code)?.label ?? code

const onRestrictionMarksChange = (g: Import40GoodsItemInput, values: string[]) => {
  g.restrictionMarks = values.length ? values.join(',') : null
  sync()
}

const emptyPayment = (): Import40GoodsPayment => ({
  taxModeCode: null, taxBase: null, rateKindCode: '%', rateValue: null,
  rateUnitCode: null, rateCurrencyCode: null, weightRatio: null,
  rateDate: null, paymentFeatureCode: 'ИУ', amountKzt: null,
})

const addPayment = (g: Import40GoodsItemInput) => {
  g.payments = [...(g.payments ?? []), emptyPayment()]
  sync()
}

// Принимает саму строку платежа (а не индекс) — строки рендерятся из
// sortedPayments(g), отсортированной копии, чей порядок индексов не совпадает
// с исходным g.payments; сравниваем по ссылке на объект.
const removePayment = (g: Import40GoodsItemInput, payment: Import40GoodsPayment) => {
  g.payments = (g.payments ?? []).filter((p) => p !== payment)
  sync()
}

// Маркировка (гр.31.13) — коллекция строк. По образцу addPayment/removePayment:
// мутируем g.markings, затем sync() эмитит новый массив с копиями (в т.ч. markings).
const emptyMarking = (): Import40GoodsMarking => ({
  markingAfterRelease: false, kizCount: null, levelCode: null,
  idTypeCode: null, idApplicationCode: null, number: null, aggregated: false,
})

const addMarking = (g: Import40GoodsItemInput) => {
  g.markings = [...(g.markings ?? []), emptyMarking()]
  sync()
}

const removeMarking = (g: Import40GoodsItemInput, marking: Import40GoodsMarking) => {
  g.markings = (g.markings ?? []).filter((m) => m !== marking)
  sync()
}

// Справочники кодов маркировки гр.31.13 (по Решению 257 / образцу КЕДЕН).
const MARKING_LEVEL_OPTIONS = computed(() => ([

  { value: '0', label: t('dt.0TovarPotrebUpakovka') },
  { value: '1', label: t('dt.1GruppovayaUpakovka') },
  { value: '2', label: t('dt.2TransportnayaUpakovka') },
  { value: '3', label: t('dt.3NaborDlyaRoznicy') },
  { value: '4', label: t('dt.4PotrebUpakovkaRaznye') },
]))
// Код вида идентификации (m.idTypeCode)
const MARKING_ID_TYPE_OPTIONS = computed(() => ([

  { value: '101', label: t('dt.101LineynyyShtrihkodCode128') },
  { value: '301', label: '301 — DataMatrix' },
  { value: '302', label: t('dt.302QrKod') },
  { value: '303', label: '303 — MicroQR' },
  { value: '401', label: t('dt.401RfidMetkaUhf') },
  { value: '999', label: t('dt.999Prochee') },
]))
// Код идентификатора применения (m.idApplicationCode)
const MARKING_ID_APPLICATION_OPTIONS = computed(() => ([

  { value: '00', label: t('dt.00SsccKodTransportnoy') },
  { value: '01', label: t('dt.01GtinEdinicyTovara') },
  { value: '02', label: t('dt.02GtinVnutriTary') },
  { value: '21', label: t('dt.21SeriynyyNomer') },
  { value: '91', label: t('dt.91IdentifikatorKlyuchaProverki') },
  { value: '92', label: t('dt.92KodProverki') },
]))
// Импорт маркировок из Excel. Формат (без шапки): A=Номер маркировки,
// B=Код уровня, C=Код идентификатора применения, D=Код вида идентификации.
const importMarkingsFromExcel = async (g: Import40GoodsItemInput, file: File) => {
  const XLSX = await loadXlsx()
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) { message.warning(t('dt.vFayleNetListov')); return }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null, raw: true })
    const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim())
    // idApplicationCode — 2-значный (02, 91…): дополняем ведущим нулём, если Excel потерял его как число.
    const pad2 = (v: unknown): string | null => {
      const t = s(v); return t == null ? null : (t.length === 1 ? '0' + t : t)
    }
    const parsed: Import40GoodsMarking[] = []
    for (const r of rows) {
      if (!Array.isArray(r)) continue
      const number = s(r[0])
      const levelCode = s(r[1])
      const idApplicationCode = pad2(r[2])
      const idTypeCode = s(r[3])
      if (!number && !levelCode && !idApplicationCode && !idTypeCode) continue // пустая строка
      parsed.push({ markingAfterRelease: false, kizCount: null, levelCode, idTypeCode, idApplicationCode, number, aggregated: false })
    }
    if (!parsed.length) { message.warning(t('dt.vFayleNetStrok')); return }
    g.markings = [...(g.markings ?? []), ...parsed]
    sync()
    message.success(t('dt.importirovanoMarkirovokParsedLength', { n: parsed.length }))
  } catch {
    message.error(t('dt.neUdalosProchitatExcel'))
  }
  return false // отменяем авто-загрузку a-upload
}

// Task 6b: копирует g.tempImportMonths первого товара во все остальные.
const applyMonthsToAll = () => {
  const months = items.value[0]?.tempImportMonths ?? null
  items.value.forEach((g) => { g.tempImportMonths = months })
  sync()
}
</script>

<style scoped>
.keden-panel { display: flex; flex-direction: column; gap: 8px; }
.section-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.header-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.section-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--z-ink); }
.payments-bar { margin-top: 12px; }
.payments-summary-bar { margin-top: 4px; }
.payments-summary-table { margin-bottom: 8px; }
.payments-summary-empty { margin-bottom: 8px; }
.b-line-block { margin-bottom: 12px; font-size: 12px; color: var(--z-muted); }
.b-line-label { font-weight: 600; margin-right: 6px; }
.b-line-value { font-variant-numeric: tabular-nums; word-break: break-word; }
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; }
.field.f-2 { flex: 2; }
/* гр.31 (упаковка) / гр.37 (процедура) селекты: коды короткие, но названия в
   выпадающем списке длинные — узкое поле обрезает список. Даём полю больше
   места и снимаем dropdown-match-select-width на самом контроле (см. шаблон). */
.field.field-wide { flex: 2; min-width: 260px; }
/* гр.33 «Признаки соблюдения запретов»: длинные подписи вариантов раньше
   рендерились полными тегами и вылезали на соседние поля. Теперь тег = только
   код (полный текст в tooltip), тег компактный и не переполняет контрол. */
.ois-marks-select :deep(.ant-select-selector) { overflow: hidden; }
.ois-mark-tag { margin: 1px 2px; padding: 0 4px; font-weight: 600; line-height: 18px; }

/* «Сумма граф» — полоса итогов по всем товарам */
.decl-sum-strip {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 14px; margin-bottom: 10px;
  border: 1px solid var(--z-line); border-radius: 10px;
  background: var(--z-surface-2);
}
.decl-sum-title {
  font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--z-muted);
}
.decl-sum-items { display: flex; gap: 10px 22px; flex-wrap: wrap; }
.decl-sum-item { display: flex; flex-direction: column; gap: 1px; }
.decl-sum-item > span { font-size: 12px; color: var(--z-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.decl-sum-item > b { font-size: 14px; color: var(--z-ink); font-weight: 700; }
.decl-sum-item--accent > b { color: var(--z-teal-d); }

/* Гр.В — общие платежи по декларации */
.gr-v-block { margin: 8px 0 10px; }
.gr-v-rows {
  border: 1px solid var(--z-line); border-radius: 10px; overflow: hidden;
}
.gr-v-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px; border-bottom: 1px solid var(--z-line-strong);
}
.gr-v-row:last-child { border-bottom: 0; }
.gr-v-code {
  font-family: 'SFMono-Regular', ui-monospace, monospace; font-size: 12px; font-weight: 600;
  color: #3b6fd6; background: #e7effc; padding: 1px 7px; border-radius: 6px; flex: 0 0 auto;
}
.gr-v-name { flex: 1; font-size: 13px; color: var(--z-navy-3); }
.gr-v-amount { font-size: 13.5px; font-weight: 700; color: var(--z-ink); }
.gr-v-total { background: var(--z-surface-2); }
.gr-v-total .gr-v-name { font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: 0.03em; }
.gr-v-total .gr-v-amount { color: var(--z-teal-d); font-size: 15px; }
.field-label { margin-bottom: 2px; font-size: 13px; font-weight: 500; color: var(--z-ink-2); }
.payment-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.marking-collapse { margin-top: 4px; margin-bottom: 8px; }
.marking-block { border: 1px solid var(--z-line); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.marking-block .field-row:last-child { margin-bottom: 0; }
.marking-remove { display: flex; align-items: flex-end; justify-content: flex-end; }
.marking-empty { color: var(--z-muted); font-size: 12px; margin-bottom: 8px; }
.marking-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.marking-hint { font-size: 12px; color: var(--z-muted); }
.empty-state { color: var(--z-muted); font-size: 12px; }
</style>
