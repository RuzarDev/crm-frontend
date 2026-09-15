<!-- crm-frontend/src/components/Import40GoodsKedenPanel.vue -->
<template>
  <div class="keden-panel">
    <div class="section-bar">
      <span class="section-label">ДАННЫЕ КЕДЕН ПО ТОВАРАМ (гр.31/36/43–47)</span>
      <div class="header-buttons">
        <a-button v-if="!readonly && items.length > 1" size="small" @click="applyMonthsToAll">
          Проставить месяцы всем товарам
        </a-button>
        <a-button v-if="!readonly" size="small" @click="emit('calc-tpin')">Рассчитать ТПиН (авто)</a-button>
      </div>
    </div>

    <!-- Гр.47 — платежи: явная, всегда развёрнутая подсекция (не внутри свёрнутого
         a-collapse ниже) — раньше платежи были видны только после раскрытия панели
         товара, декларант их не находила. Показываем то, что реально записано в
         g.payments; редактирование строк остаётся в панели товара ниже. -->
    <div v-if="items.length" class="section-bar payments-summary-bar">
      <span class="section-label">ГР.47 — ПЛАТЕЖИ</span>
    </div>
    <a-table
      v-if="paymentsSummaryRows.length"
      class="payments-summary-table"
      :data-source="paymentsSummaryRows"
      :columns="paymentsSummaryColumns"
      :pagination="false"
      size="small"
      row-key="key"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'amount'">
          {{ fmtAmount(record[column.key]) }}
        </template>
        <template v-else-if="column.key === 'base'">
          {{ record.basisLabel ?? fmtAmount(record.base) }}
        </template>
        <template v-else-if="column.key === 'rate'">
          {{ record.rateLabel ?? fmtAmount(record.rate) }}
        </template>
        <template v-else-if="column.key === 'sp'">
          {{ record.featureCode || '—' }}
        </template>
      </template>
    </a-table>
    <div v-else-if="items.length" class="empty-state payments-summary-empty">
      Платежи гр.47 не рассчитаны — нажмите «Рассчитать ТПиН (авто)» выше или «Рассчитать платежи» в шапке ДТ.
    </div>
    <!-- Гр.B (детализация): строки "{код}-{сумма}-398-{дата}-БН" из последнего
         calculate-payments — читаемая расшифровка того, что записано в гр.B. -->
    <div v-if="bLineRows.length" class="b-line-block">
      <span class="b-line-label">Гр.B (детализация):</span>
      <span class="b-line-value">{{ bLineRows.join('; ') }}</span>
    </div>

    <a-collapse v-if="items.length" ghost>
      <a-collapse-panel v-for="(g, i) in items" :key="i" :header="`Товар ${i + 1}: ${g.tnvedCode || 'без кода'} — ${g.description || ''}`">
        <template #extra>
          <a-tag v-if="g.needsTpinRecalc" color="orange" @click.stop>Пересчитать ТПиН</a-tag>
          <a-tooltip v-if="hasReducedVat(g)" title="Пониженный НДС (5%) — применяется автоматически по коду ТНВЭД или вручную">
            <a-tag color="green" @click.stop>НДС 5%</a-tag>
          </a-tooltip>
        </template>
        <div class="field-row">
          <div class="field"><div class="field-label">Торговая марка</div>
            <a-input v-model:value="g.tradeMarkName" v-uppercase size="small" :disabled="readonly" @change="sync" /></div>
          <div class="field"><div class="field-label">Знак</div>
            <a-input v-model:value="g.productMarkName" v-uppercase size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
          <div class="field"><div class="field-label">Модель</div>
            <a-input v-model:value="g.productModelName" v-uppercase size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
          <div class="field"><div class="field-label">Артикул</div>
            <a-input v-model:value="g.productArticle" v-uppercase size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field f-2"><div class="field-label">Производитель</div>
            <a-input v-model:value="g.manufacturerName" v-uppercase size="small" :disabled="readonly" @change="sync" /></div>
        </div>

        <!-- Упаковка (гр.31) — единой строкой: наличие/вид/кол-во упаковок/грузомест -->
        <div class="section-bar"><span class="section-label">УПАКОВКА (гр.31)</span></div>
        <div class="field-row">
          <div class="field"><div class="field-label">Наличие упаковки</div>
            <a-select v-model:value="g.packageAvailabilityCode" size="small" :disabled="readonly" show-search
              :options="packagingAvailabilityOptions" :dropdown-match-select-width="false" allow-clear
              :get-popup-container="popupContainer" placeholder="0/1/2" @change="sync" /></div>
          <div class="field field-wide" style="min-width: 260px"><div class="field-label">Вид упаковки</div>
            <a-auto-complete v-model:value="g.packageKindCode" size="small" :disabled="readonly"
              :options="pkgOptions" :dropdown-match-select-width="false" placeholder="PK"
              :get-popup-container="popupContainer" @change="sync" /></div>
          <div class="field"><div class="field-label">Количество упаковок</div>
            <a-input-number v-model:value="g.packageQuantity" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Кол-во грузовых мест</div>
            <a-input-number v-model:value="g.cargoPlacesQuantity" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Преференция: сбор</div>
            <a-auto-complete v-model:value="g.prefClearanceCode" size="small" :disabled="readonly" :options="prefOptions" :get-popup-container="popupContainer" placeholder="ОО" @change="sync" /></div>
          <div class="field"><div class="field-label">Пошлина</div>
            <a-auto-complete v-model:value="g.prefDutyCode" size="small" :disabled="readonly" :options="prefOptions" :get-popup-container="popupContainer" placeholder="ОО" @change="sync" /></div>
          <div class="field"><div class="field-label">Акциз</div>
            <a-auto-complete v-model:value="g.prefExciseCode" size="small" :disabled="readonly" :options="prefOptions" :get-popup-container="popupContainer" placeholder="Z" @change="sync" /></div>
          <div class="field"><div class="field-label">НДС
              <a-tooltip v-if="hasReducedVat(g)" title="Пониженный НДС (5%) — применяется автоматически по коду ТНВЭД или вручную">
                <a-tag color="green" style="margin-left: 4px">5%</a-tag>
              </a-tooltip>
            </div>
            <a-auto-complete v-model:value="g.prefVatCode" size="small" :disabled="readonly" :options="prefOptions" :get-popup-container="popupContainer" placeholder="ОО" @change="sync" /></div>
        </div>
        <div v-if="containerIndicator" class="field-row">
          <div class="field"><div class="field-label">Номер контейнера (гр.31.3)</div>
            <a-input v-uppercase v-model:value="g.containerNumber" size="small" :disabled="readonly" placeholder="GLDU9071686" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Процедура (гр.37)</div>
            <a-input v-model:value="g.procedureCode" size="small" :disabled="readonly" placeholder="4000" @change="sync" /></div>
          <div class="field field-wide"><div class="field-label">Предш. процедура (гр.37)</div>
            <a-auto-complete v-model:value="g.previousProcedureCode" size="small" :disabled="readonly" :options="procOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" placeholder="00" @change="sync" /></div>
          <div class="field field-wide"><div class="field-label">Особенность перемещения</div>
            <a-auto-complete v-model:value="g.goodsMoveFeatureCode" size="small" :disabled="readonly" :options="moveFeatureOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" placeholder="000" @change="sync" /></div>
          <div class="field"><div class="field-label">Метод ТС (гр.43)</div>
            <a-auto-complete v-model:value="g.valuationMethodCode" size="small" :disabled="readonly" :options="valuationOptions" :get-popup-container="popupContainer" placeholder="1" @change="sync" /></div>
          <div class="field"><div class="field-label">Квота (гр.39)</div>
            <a-input-number v-model:value="g.quotaAmount" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Кол-во месяцев (врем. ввоз)</div>
            <a-input-number v-model:value="g.tempImportMonths" size="small" :disabled="readonly" :min="0" :precision="0" style="width: 100%" placeholder="0" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Таможенная стоимость, ₸ (гр.45)</div>
            <a-input-number v-model:value="g.customsValueKzt" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="onCustomsValueChange(g)" /></div>
          <div class="field"><div class="field-label">Статистическая, USD (гр.46)
              <a-tooltip title="Авто = таможенная стоимость (гр.45) ÷ курс USD на дату гр.А. Можно изменить вручную; пересчитывается при изменении гр.45.">
                <QuestionCircleOutlined style="margin-left: 4px; color: var(--z-text-secondary, #999)" />
              </a-tooltip>
            </div>
            <a-input-number v-model:value="g.statisticValueUsd" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Код запрета</div>
            <a-input v-model:value="g.prohibitionCode" size="small" :disabled="readonly" placeholder="D0110" @change="sync" /></div>
          <div class="field"><div class="field-label">Код ИС</div>
            <a-input v-model:value="g.ipoCode" size="small" :disabled="readonly" placeholder="N" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field f-2"><div class="field-label">Сертификация / эксп. контроль</div>
            <a-input v-uppercase v-model:value="g.certificationNote" size="small" :disabled="readonly" @change="sync" /></div>
        </div>

        <!-- ОИС / признаки соблюдения запретов (гр.33 «О») -->
        <div class="section-bar"><span class="section-label">ОИС / ЗАПРЕТЫ (гр.33 «О»)</span></div>
        <div class="field-row">
          <div class="field"><div class="field-label">ОИС</div>
            <a-select v-model:value="g.oisIndicatorCode" size="small" :disabled="readonly" show-search
              :options="oisIndicatorOptions" :dropdown-match-select-width="false" allow-clear
              :get-popup-container="popupContainer" placeholder="I/N/S" @change="sync" /></div>
          <div class="field field-wide"><div class="field-label">Признаки соблюдения запретов</div>
            <a-select :value="restrictionMarksArray(g)" mode="multiple" size="small" :disabled="readonly"
              :options="restrictionMarksOptions" :dropdown-match-select-width="false" allow-clear
              :get-popup-container="popupContainer" placeholder="С/М/П" @change="(v: string[]) => onRestrictionMarksChange(g, v)" /></div>
          <div class="field"><div class="field-label">Рег.№ по ОИС</div>
            <a-input v-uppercase v-model:value="g.oisRegNumber" size="small" :disabled="readonly" @change="sync" /></div>
          <div class="field"><div class="field-label">Код страны ОИС</div>
            <a-input v-uppercase v-model:value="g.oisCountryCode" size="small" :disabled="readonly" :maxlength="2" @change="sync" /></div>
        </div>

        <!-- Маркировка товаров (гр.31.13) — сворачиваемый блок, редко нужен -->
        <a-collapse ghost class="marking-collapse">
          <a-collapse-panel key="marking" header="Маркировка товаров (гр.31.13)">
            <div class="field-row">
              <div class="field"><div class="field-label">После выпуска</div>
                <a-checkbox v-model:checked="g.markingAfterRelease" :disabled="readonly" @change="sync">Маркировка после выпуска</a-checkbox></div>
              <div class="field"><div class="field-label">Кол-во КИЗ</div>
                <a-input-number v-model:value="g.markingKizCount" size="small" :disabled="readonly" :min="0" :precision="0" style="width: 100%" @change="sync" /></div>
              <div class="field"><div class="field-label">Агрегация</div>
                <a-checkbox v-model:checked="g.markingAggregated" :disabled="readonly" @change="sync">Агрегированная упаковка</a-checkbox></div>
            </div>
            <div class="field-row">
              <div class="field"><div class="field-label">Уровень маркировки</div>
                <a-input v-uppercase v-model:value="g.markingLevelCode" size="small" :disabled="readonly" @change="sync" /></div>
              <div class="field"><div class="field-label">Тип идентификатора</div>
                <a-input v-uppercase v-model:value="g.markingIdTypeCode" size="small" :disabled="readonly" @change="sync" /></div>
              <div class="field"><div class="field-label">Способ нанесения ID</div>
                <a-input v-uppercase v-model:value="g.markingIdApplicationCode" size="small" :disabled="readonly" @change="sync" /></div>
              <div class="field f-2"><div class="field-label">Номер маркировки</div>
                <a-input v-uppercase v-model:value="g.markingNumber" size="small" :disabled="readonly" @change="sync" /></div>
            </div>
          </a-collapse-panel>
        </a-collapse>

        <div class="section-bar payments-bar">
          <span class="section-label">ПЛАТЕЖИ гр.47</span>
          <a-tag v-if="g.tempImportMonths" color="blue">Врем. ввоз: 3%×{{ g.tempImportMonths }} мес</a-tag>
          <a-button v-if="!readonly" type="dashed" size="small" @click="addPayment(g)">+ Строка</a-button>
        </div>
        <div v-for="(p, pi) in sortedPayments(g)" :key="pi" class="payment-row">
          <a-auto-complete v-model:value="p.taxModeCode" size="small" :disabled="readonly" :options="taxModeOptions" placeholder="Вид (2010)" style="width: 140px" :get-popup-container="popupContainer" @change="sync" />
          <a-input-number v-model:value="p.taxBase" size="small" :disabled="readonly" placeholder="Основа" style="width: 130px" @change="sync" />
          <!-- Task 10, №13: вид ставки/дата НЕ обязательны для показа сумм — суммы гр.47
               уже заполнены "Рассчитать платежи"/"Рассчитать ТПиН" выше (см. сводную
               таблицу и applyPaymentsResult); эти поля — необязательное ручное уточнение
               (например, для весовых ставок '*'), поэтому оба с allow-clear. -->
          <a-select v-model:value="p.rateKindCode" size="small" :disabled="readonly" :options="rateKindOptions" allow-clear placeholder="Вид ставки (авто)" style="width: 130px" :get-popup-container="popupContainer" @change="sync" />
          <a-input-number v-model:value="p.rateValue" size="small" :disabled="readonly" placeholder="Ставка" style="width: 100px" @change="sync" />
          <template v-if="p.rateKindCode === '*'">
            <a-input v-model:value="p.rateUnitCode" size="small" :disabled="readonly" placeholder="ОКЕИ (166)" style="width: 90px" @change="sync" />
            <a-input v-model:value="p.rateCurrencyCode" size="small" :disabled="readonly" placeholder="Валюта N3 (978)" style="width: 110px" @change="sync" />
            <a-input-number v-model:value="p.weightRatio" size="small" :disabled="readonly" placeholder="Коэф." style="width: 80px" @change="sync" />
          </template>
          <a-date-picker v-model:value="p.rateDate" size="small" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" placeholder="Дата (авто)" style="width: 130px" allow-clear @change="sync" />
          <a-input-number v-model:value="p.amountKzt" size="small" :disabled="readonly" placeholder="Сумма, ₸" style="width: 130px" @change="sync" />
          <a-button v-if="!readonly" type="text" danger size="small" @click="removePayment(g, p)"><CloseOutlined /></a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
    <div v-else class="empty-state">Сначала добавьте товары</div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { CloseOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import type { Import40GoodsItemInput, Import40GoodsPayment } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const props = defineProps<{
  modelValue: Import40GoodsItemInput[]
  readonly?: boolean
  // гр.19: показываем поле «Номер контейнера» (гр.31.3) только при контейнерных
  // перевозках — иначе поле не заполняется и загромождает панель.
  containerIndicator?: boolean
  // Item I (гр.46): курс доллара (₸ за 1 USD) на дату гр.А — для авторасчёта
  // статистической стоимости = таможенная стоимость (гр.45, ₸) / курс USD.
  usdRate?: number | null
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

// Item I (гр.46 статистическая стоимость, USD): авто = таможенная стоимость
// (гр.45, ₸) / курс доллара на дату гр.А. Поле остаётся редактируемым — авто-
// расчёт срабатывает только когда значение ещё пустое (0/null) или когда
// декларант меняет гр.45 (явное действие). Ручной ввод в гр.46 сохраняется до
// следующего изменения гр.45.
const calcStatUsd = (customsValueKzt: number | null | undefined): number | null => {
  const rate = props.usdRate
  if (!rate || rate <= 0 || customsValueKzt == null) return null
  return Math.round((customsValueKzt / rate) * 100) / 100
}

// Изменение гр.45 → пересчитать гр.46 (если курс известен), затем sync.
// (sync объявлена ниже; вызывается только по событию — TDZ не задевает.)
const onCustomsValueChange = (g: Import40GoodsItemInput) => {
  const stat = calcStatUsd(g.customsValueKzt)
  if (stat != null) g.statisticValueUsd = stat
  sync()
}

// Русские названия видов платежа гр.47 (см. tax-modes в DatabaseExtensions.cs
// на бэке) — для явной, не-кодовой подписи в сводной таблице ниже.
const TAX_MODE_LABELS: Record<string, string> = {
  '2010': 'Пошлина',
  '4010': 'Акциз',
  '1010': 'Сбор',
  '5060': 'НДС',
}
const taxModeLabel = (code: string | null | undefined) =>
  code ? (TAX_MODE_LABELS[code] ?? code) : '—'

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
// см. DtPaymentsCalcModal/Import40DtView), пока расчёт ещё не проведён. Если нет ни
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
const paymentsSummaryColumns = [
  { title: 'Товар', dataIndex: 'goods', key: 'goods', width: 220, ellipsis: true },
  { title: 'Вид', dataIndex: 'taxMode', key: 'taxMode', width: 120 },
  { title: 'Основа начисления', dataIndex: 'base', key: 'base', width: 150 },
  { title: 'Ставка', dataIndex: 'rate', key: 'rate', width: 130 },
  { title: 'Сумма, ₸', dataIndex: 'amount', key: 'amount', width: 140 },
  { title: 'СП', dataIndex: 'featureCode', key: 'sp', width: 70 },
]

const fmtAmount = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  return `${rateLabel} × 3%×${tempImportMonths}мес`
}

const paymentsSummaryRows = computed<PaymentsSummaryRow[]>(() => {
  const rows: PaymentsSummaryRow[] = []
  items.value.forEach((g, gi) => {
    sortedPayments(g).forEach((p, pi) => {
      rows.push({
        key: `${gi}-${pi}`,
        goods: `Товар ${gi + 1}: ${g.tnvedCode || 'без кода'} — ${g.description || ''}`,
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
// при "Записать в гр.47 и гр.B" в модалке расчёта, см. Import40DtView.applyPaymentsResult).
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
    props.modelValue.map((g) => ({ ...g, payments: (g.payments ?? []).map((p) => ({ ...p })) })),
  )

// Item I (гр.46): первичное авто-заполнение. Когда товары/курс USD загрузились,
// проставить статистическую стоимость тем товарам, где она ещё пуста (0/null), а
// таможенная стоимость и курс известны. Уже введённые значения не затираем.
// Размещено после sync (immediate:true исполняется синхронно при setup — sync
// должна быть уже инициализирована).
watch(
  () => [props.usdRate, items.value.map((g) => g.customsValueKzt ?? '').join(',')].join('|'),
  () => {
    let changed = false
    items.value.forEach((g) => {
      if ((g.statisticValueUsd == null || g.statisticValueUsd === 0) && g.customsValueKzt != null) {
        const stat = calcStatUsd(g.customsValueKzt)
        if (stat != null) {
          g.statisticValueUsd = stat
          changed = true
        }
      }
    })
    if (changed) sync()
  },
  { immediate: true },
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

// Task 6b: копирует g.tempImportMonths первого товара во все остальные.
const applyMonthsToAll = () => {
  const months = items.value[0]?.tempImportMonths ?? null
  items.value.forEach((g) => { g.tempImportMonths = months })
  sync()
}
</script>

<style scoped>
.keden-panel { display: flex; flex-direction: column; gap: 8px; }
.section-bar { display: flex; align-items: center; justify-content: space-between; }
.header-buttons { display: flex; align-items: center; gap: 8px; }
.section-label { font-size: 12px; font-weight: 600; color: var(--atg-muted); }
.payments-bar { margin-top: 12px; }
.payments-summary-bar { margin-top: 4px; }
.payments-summary-table { margin-bottom: 8px; }
.payments-summary-empty { margin-bottom: 8px; }
.b-line-block { margin-bottom: 12px; font-size: 12px; color: var(--atg-muted); }
.b-line-label { font-weight: 600; margin-right: 6px; }
.b-line-value { font-variant-numeric: tabular-nums; word-break: break-word; }
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; }
.field.f-2 { flex: 2; }
/* гр.31 (упаковка) / гр.37 (процедура) селекты: коды короткие, но названия в
   выпадающем списке длинные — узкое поле обрезает список. Даём полю больше
   места и снимаем dropdown-match-select-width на самом контроле (см. шаблон). */
.field.field-wide { flex: 2; min-width: 260px; }
.field-label { font-size: 11px; color: var(--atg-muted); margin-bottom: 2px; }
.payment-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.marking-collapse { margin-top: 4px; margin-bottom: 8px; }
.empty-state { color: var(--atg-muted); font-size: 12px; }
</style>
