<template>
  <div class="dt-section dts-section">
    <div class="dt-section-bar dts-top-bar">
      <div class="dts-toggle">
        <a-switch v-model:checked="form.dtsFreeOfCharge" :disabled="readonly" @change="emitChange" />
        <span class="dt-section-label">{{ t('dt.dtsBezvozmezdnaya') }}</span>
        <a-tag :color="form.dtsFreeOfCharge ? 'purple' : 'blue'">
          {{ form.dtsFreeOfCharge ? t('dt.dtsForm2') : t('dt.dtsForm1') }}
        </a-tag>
      </div>
      <div class="dts-actions">
        <!-- Обновить/печать/инф.лист — просмотр, не редактирование: явный :disabled
             нужен, иначе a-form :disabled="readOnly" родителя каскадом гасит кнопки
             (AntD прокидывает disabled формы в a-button). XML — правка/выгрузка,
             остаётся под readonly-каскадом как есть. -->
        <a-button :disabled="false" :loading="loading" @click="load">{{ t('dt.dtsObnovit') }}</a-button>
        <a-tooltip :title="form.dtsFreeOfCharge ? t('dt.dtsPechatForm2') : undefined">
          <a-button :disabled="form.dtsFreeOfCharge" :loading="pdfLoading" @click="printPdf">{{ t('dt.dtsPechat') }}</a-button>
        </a-tooltip>
        <a-button :disabled="false" :loading="infoLoading" @click="printInfoSheet">{{ t('dt.dtsInfoSheet') }}</a-button>
        <a-button type="primary" :loading="xmlLoading" @click="generateXml">{{ t('dt.dtsXml') }}</a-button>
      </div>
    </div>

    <a-alert v-if="missing.length" type="warning" show-icon class="dts-missing">
      <template #message>{{ t('dt.dtsXmlNeGotov') }}</template>
      <template #description>
        <ul><li v-for="m in missing" :key="m">{{ m }}</li></ul>
      </template>
    </a-alert>

    <a-spin :spinning="loading">
      <template v-if="sheet">
        <div class="dt-section-bar"><span class="dt-section-label">{{ t('dt.dtsOsnovnoyList') }}</span></div>
        <a-descriptions bordered :column="2" size="small" class="dts-main-sheet">
          <a-descriptions-item :label="t('dt.dtsProdavec')"><span class="dts-multiline">{{ partyText(sheet.seller) }}</span></a-descriptions-item>
          <a-descriptions-item :label="t('dt.dtsPokupatel')"><span class="dts-multiline">{{ partyText(sheet.buyer) }}</span></a-descriptions-item>
          <a-descriptions-item :label="t('dt.deklarant')"><span class="dts-multiline">{{ partyText(sheet.declarant) }}</span></a-descriptions-item>
          <a-descriptions-item :label="t('dt.usloviyaPostavki')">{{ deliveryTermsText }}</a-descriptions-item>
          <a-descriptions-item :label="t('dt.dtsScheta')">
            <span class="dts-multiline">{{ docLines(sheet.invoices) }}</span>
          </a-descriptions-item>
          <a-descriptions-item :label="t('dt.dtsKontrakty')">
            <span class="dts-multiline">{{ docLines(sheet.contracts) }}</span>
          </a-descriptions-item>
          <a-descriptions-item :label="t('dt.dtsInyeDokumentyGr6')">
            <span class="dts-multiline">{{ docLines(sheet.box6Docs) }}</span>
          </a-descriptions-item>
          <a-descriptions-item :label="t('dt.dtsRegNomer')">{{ sheet.registrationNumber || '—' }}</a-descriptions-item>
          <a-descriptions-item :label="t('dt.dtsDobavochnyhListov')">{{ sheet.addSheets }}</a-descriptions-item>
          <a-descriptions-item :label="t('dt.dtsGr10b')" :span="2">{{ sheet.box10b || '—' }}</a-descriptions-item>
        </a-descriptions>

        <div class="dt-section-bar"><span class="dt-section-label">{{ t('dt.dtsVoprosy') }}</span></div>
        <div class="dts-questions">
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ7a') }}</span>
            <a-radio-group v-model:value="form.dtsRelation" :options="yesNoOptions" :disabled="readonly" @change="emitChange" />
          </div>
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ7b') }}</span>
            <a-radio-group
              v-model:value="form.dtsRelationPriceInfluence" :options="yesNoOptions"
              :disabled="readonly || !form.dtsRelation" @change="emitChange"
            />
          </div>
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ7c') }}</span>
            <a-radio-group
              v-model:value="form.dtsRelationApproxValue" :options="yesNoOptions"
              :disabled="readonly || !form.dtsRelation" @change="emitChange"
            />
          </div>
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ8a') }}</span>
            <a-radio-group v-model:value="form.dtsRestriction" :options="yesNoOptions" :disabled="readonly" @change="emitChange" />
          </div>
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ8b') }}</span>
            <a-radio-group v-model:value="form.dtsValueCondition" :options="yesNoOptions" :disabled="readonly" @change="emitChange" />
          </div>
          <!-- Вопрос 9 — буквы как на печатной ДТС-1 (DtsBlankPdf): 9(а) = лицензионные
               платежи (RoyaltyFee), 9(б) = часть дохода продавцу (SubsequentResale).
               «Договорные отношения по ОИС» (RoyaltyContract) на бланке нет — только в XML
               R.038, поэтому последним и без печатной буквы. -->
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ9a') }}</span>
            <a-radio-group v-model:value="form.dtsRoyaltyFee" :options="yesNoOptions" :disabled="readonly" @change="emitChange" />
          </div>
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ9b') }}</span>
            <a-radio-group v-model:value="form.dtsSubsequentResale" :options="yesNoOptions" :disabled="readonly" @change="emitChange" />
          </div>
          <div class="dts-question">
            <span class="dts-question-label">{{ t('dt.dtsQ9Xml') }}</span>
            <a-radio-group v-model:value="form.dtsRoyaltyContract" :options="yesNoOptions" :disabled="readonly" @change="emitChange" />
          </div>
        </div>

        <a-form-item v-if="form.dtsFreeOfCharge" :label="t('dt.dtsObosnovanie')" class="dts-reason">
          <a-textarea v-model:value="form.dtsMethodReason" :rows="3" :disabled="readonly" @change="emitChange" />
        </a-form-item>

        <div class="dt-section-bar"><span class="dt-section-label">{{ t('dt.dtsDobavochnyList') }}</span></div>
        <a-table
          :columns="tableColumns" :data-source="tableRows" :pagination="false" size="small" bordered
          row-key="key" class="dts-table" :scroll="{ x: true }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex !== 'label'">
              <a-tooltip v-if="record.key === 'box45' && mismatchGoodsSet.has(Number(column.dataIndex))" :title="t('dt.dtsNesovpadaet')">
                <span class="dts-cell-mismatch">{{ record[column.dataIndex as string] }}</span>
              </a-tooltip>
              <span v-else>{{ record[column.dataIndex as string] }}</span>
            </template>
          </template>
        </a-table>

        <template v-if="currencyLines.length">
          <div class="dt-section-bar"><span class="dt-section-label">{{ t('dt.dtsPereschetValyut') }}</span></div>
          <ul class="dts-currency-lines">
            <li v-for="(l, i) in currencyLines" :key="i">{{ currencyLineText(l) }}</li>
          </ul>
        </template>
      </template>
      <a-empty v-else-if="!loading" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { dtsApi, type DtsSheet, type DtsParty, type DtsDocRef, type DtsGoodsColumn, type DtsCurrencyLine } from '@/api/dts'
import { referencesApi } from '@/api/references'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  caseId: string
  declarationId: string
  reloadKey: number
  // Раздел ДТС сейчас открыт (activeSection === 'dts' у родителя) — от него зависит,
  // перечитывать ли расчёт после каждого сохранения ДТ (в т.ч. автосейва).
  active: boolean
  save: (silent?: boolean) => Promise<boolean>
}>()
const emit = defineEmits<{
  'update:modelValue': [Import40DtFormState]
  ready: [boolean]
}>()

const form = reactive({ ...props.modelValue })
watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })
const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })

const yesNoOptions = computed(() => [
  { label: t('common.yes'), value: true },
  { label: t('common.no'), value: false },
])

// Расчёт ДТС — всегда с сервера (гр.5/6/12-подобная производная), не редактируется.
const sheet = ref<DtsSheet | null>(null)
const missing = ref<string[]>([])
const mismatchGoods = ref<number[]>([])
const mismatchGoodsSet = computed(() => new Set(mismatchGoods.value))
const loading = ref(false)
const pdfLoading = ref(false)
const infoLoading = ref(false)
const xmlLoading = ref(false)

const load = async () => {
  loading.value = true
  try {
    const view = await dtsApi.get(props.caseId, props.declarationId)
    sheet.value = view.sheet
    missing.value = view.missing
    mismatchGoods.value = view.mismatchGoods
    emit('ready', view.missing.length === 0)
  } catch {
    message.error(t('dt.dtsNeUdalosZagruzitRaschet'))
    emit('ready', false)
  } finally {
    loading.value = false
  }
}

// Первичная загрузка — сразу (по ней родитель ставит отметку готовности раздела в
// навигации). Дальше: при каждом открытии раздела и после сохранения ДТ (родитель
// инкрементирует reloadKey) — но только пока раздел открыт; сохранения на других
// вкладках не дёргают GET .../dts впустую — свежий расчёт подтянется при открытии.
onMounted(load)
watch(() => props.active, (isActive) => { if (isActive) void load() })
watch(() => props.reloadKey, () => { if (props.active) void load() })

// Названия статей расходов (гр.13а…23) — тот же справочник, что и в DtSectionFinance,
// нужен для человекочитаемых подписей строк добавочного листа.
const expenseNames = ref<Record<string, string>>({})
onMounted(async () => {
  try {
    const types = await referencesApi.listExpenseTypes()
    expenseNames.value = Object.fromEntries(types.map((x) => [x.code, x.nameRu]))
  } catch {
    /* таблица покажет код статьи без названия — не критично */
  }
})
const expenseLabel = (code: string) => expenseNames.value[code] ?? code

const fmt = (v: number | null | undefined): string =>
  v == null || v === 0 ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatDate = (iso: string | null): string => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

const partyText = (p: DtsParty): string => {
  const address = [p.region, p.city, p.street, p.house, p.apt].filter((x): x is string => !!x?.trim()).join(', ')
  return [p.name, p.bin ? `${t('dt.bin')} ${p.bin}` : null, address || null, p.countryName]
    .filter((x): x is string => !!x)
    .join('\n') || '—'
}

const docLines = (docs: DtsDocRef[]): string => {
  if (!docs.length) return '—'
  return docs
    .map((d) => {
      const date = formatDate(d.date)
      return date ? t('dt.dtsDokumentStroka', { kind: d.kindCode, number: d.number, date }) : `${d.kindCode}/1 ${d.number}`
    })
    .join('\n')
}

const deliveryTermsText = computed(() => {
  const s = sheet.value
  if (!s) return '—'
  if (!s.incotermsCode) return '—'
  return s.incotermsPlace ? `${s.incotermsCode} — ${s.incotermsPlace}` : s.incotermsCode
})

const goods = computed((): DtsGoodsColumn[] => sheet.value?.goods ?? [])

// Коды статей — в каноническом порядке КТС/ДтsExpenseCodes, но в таблицу попадают
// только те, что реально встретились (ненулевые) хотя бы у одного товара.
const ADDITION_ORDER = ['13a', '13b', '14a', '14b', '14c', '14d', '15', '16', '17', '18', '19']
const DEDUCTION_ORDER = ['21', '22', '23']

const codesInUse = (order: string[], pick: (g: DtsGoodsColumn) => Record<string, number>) => {
  const set = new Set<string>()
  for (const g of goods.value) for (const c of Object.keys(pick(g))) set.add(c)
  return order.filter((c) => set.has(c))
}
const additionCodes = computed(() => codesInUse(ADDITION_ORDER, (g) => g.additions))
const deductionCodes = computed(() => codesInUse(DEDUCTION_ORDER, (g) => g.deductions))

interface TableRow { key: string; label: string; [goodNumber: string]: string }

const tableColumns = computed(() => {
  const cols: { title: string; dataIndex: string; key: string; align?: string; width?: number; fixed?: 'left' }[] = [
    { title: '', dataIndex: 'label', key: 'label', fixed: 'left', width: 220 },
  ]
  for (const g of goods.value) {
    cols.push({
      title: t('dt.dtsTovarKolonka', { n: g.number, code: g.tnvedCode ?? '—' }),
      dataIndex: String(g.number),
      key: String(g.number),
      align: 'right',
    })
  }
  return cols
})

const tableRows = computed((): TableRow[] => {
  const rows: TableRow[] = []
  const put = (key: string, label: string, valueFn: (g: DtsGoodsColumn) => number | null, currency?: boolean) => {
    const row: TableRow = { key, label }
    for (const g of goods.value) {
      const raw = valueFn(g)
      row[String(g.number)] = currency
        ? (raw == null || raw === 0 ? '—' : `${fmt(raw)} ${g.invoiceCurrency}`)
        : fmt(raw)
    }
    rows.push(row)
  }

  put('box11a-cur', t('dt.dtsGr11aValuta'), (g) => g.invoicePrice, true)
  put('box11a-kzt', t('dt.dtsGr11aKzt'), (g) => g.invoicePriceKzt)
  put('box12', t('dt.grShort', { n: '12' }), (g) => g.box12)
  for (const code of additionCodes.value) put(`add-${code}`, expenseLabel(code), (g) => g.additions[code] ?? 0)
  put('box20', t('dt.grShort', { n: '20' }), (g) => g.box20)
  for (const code of deductionCodes.value) put(`ded-${code}`, expenseLabel(code), (g) => g.deductions[code] ?? 0)
  put('box24', t('dt.grShort', { n: '24' }), (g) => g.box24)
  put('box25a', t('dt.dtsGr25aKzt'), (g) => g.box25Kzt)
  put('box25b', t('dt.dtsGr25bUsd'), (g) => g.box25Usd)
  put('box45', t('dt.dtsGr45Dt'), (g) => g.declaredCustomsValueKzt)
  return rows
})

const currencyLines = computed((): DtsCurrencyLine[] => goods.value.flatMap((g) => g.currencyLines))
const currencyLineText = (l: DtsCurrencyLine): string =>
  t('dt.dtsPereschetStroka', {
    good: t('dt.tovarIndex1', { n: l.goodsNumber }),
    box: expenseLabel(l.box),
    amount: fmt(l.amount),
    currency: l.currency,
    rate: fmt(l.rate),
  })

const openBlobPdf = (blob: Blob) => {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// В readonly (в т.ч. клиент-владелец заявки — см. GetPdf) props.save() дёргать
// нельзя: сервер всё равно отклонит правку (или её вовсе нет для клиента), а
// несохранённого локального состояния у DTS-раздела в readonly не бывает
// (все поля тоже задизейблены) — просто печатаем как есть.
const printPdf = async () => {
  if (!props.readonly) {
    const ok = await props.save()
    if (!ok) return
  }
  pdfLoading.value = true
  try {
    openBlobPdf(await dtsApi.pdf(props.caseId, props.declarationId, 'pdf'))
  } catch (e: any) {
    message.error(e?.message || t('dt.neUdalosSformirovatBlank'))
  } finally {
    pdfLoading.value = false
  }
}

const printInfoSheet = async () => {
  if (!props.readonly) {
    const ok = await props.save()
    if (!ok) return
  }
  infoLoading.value = true
  try {
    openBlobPdf(await dtsApi.pdf(props.caseId, props.declarationId, 'info-sheet-pdf'))
  } catch (e: any) {
    message.error(e?.message || t('dt.neUdalosSformirovatBlank'))
  } finally {
    infoLoading.value = false
  }
}

const generateXml = async () => {
  // несохранённые правки (в т.ч. переключатель безвозмездности/ответы 7-9) не
  // должны теряться при выгрузке — родитель сохраняет декларацию целиком.
  const ok = await props.save()
  if (!ok) return
  xmlLoading.value = true
  try {
    const res = await dtsApi.xml(props.caseId, props.declarationId)
    if ('errors' in res) {
      missing.value = res.errors
      message.warning(t('dt.dtsXmlNeGotov'))
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('dt.dtsXmlGotov'))
  } catch {
    message.error(t('dt.neUdalosSformirovatXml'))
  } finally {
    xmlLoading.value = false
  }
}
</script>

<style scoped>
.dts-top-bar { flex-wrap: wrap; gap: 12px; }
.dts-toggle { display: flex; align-items: center; gap: 10px; }
.dts-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dts-missing { margin-bottom: 14px; }
.dts-main-sheet { margin-bottom: 18px; }
.dts-multiline { white-space: pre-line; }
.dts-questions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 24px;
  margin-bottom: 14px;
}
.dts-question {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--atg-line);
}
.dts-question-label { font-size: 13px; color: var(--atg-text); }
.dts-reason { margin-bottom: 14px; }
.dts-cell-mismatch { color: var(--z-danger); font-weight: 600; }
.dts-currency-lines { margin: 0; padding-left: 18px; font-size: 13px; color: var(--atg-muted); }
:deep(.dts-table td) { text-align: right; }
:deep(.dts-table td:first-child) { text-align: left; font-weight: 500; }
</style>
