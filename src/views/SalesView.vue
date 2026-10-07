<template>
  <div class="sales-page crm-page">
    <PageHeader :title="t('sales.kommercheskoePredlozhenie')" :subtitle="t('sales.raschetStoimostiUslugI')" />

    <a-tabs v-model:activeKey="tab">
      <a-tab-pane key="calc" :tab="t('sales.kalkulyator')" />
      <a-tab-pane key="quotes" :tab="isAllQuotes ? t('sales.vseKp') : t('sales.moiKp')" />
    </a-tabs>

    <!-- КАЛЬКУЛЯТОР -->
    <template v-if="tab === 'calc'">
      <div class="sales-stack">
        <a-card class="crm-shell-card" :bordered="false">
          <template #title><div class="card-title"><UserOutlined /> {{ t('sales.klientIUsloviyaPostavki') }}</div></template>
          <div class="client-grid">
            <label><span>{{ t('sales.klient') }}</span><a-input v-model:value="clientName" :placeholder="t('sales.nazvanieKompanii')" /></label>
            <label><span>{{ t('sales.kontakt') }}</span><a-input v-model:value="clientContact" :placeholder="t('sales.telefonEMail')" /></label>
            <label class="full"><span>{{ t('sales.kommentariy') }}</span><a-input v-model:value="comment" :placeholder="t('sales.primechanieKRaschetu')" /></label>
            <label><span>{{ t('sales.usloviyaPostavki') }}</span>
              <a-select v-model:value="incoterms" allow-clear :placeholder="t('sales.inkoterms')" :options="classifiers.options('incoterms')" />
            </label>
            <label><span>{{ t('sales.stoimostTransportirovki') }}</span>
              <div class="inline-field">
                <a-input-number v-model:value="transportCost" :min="0" style="flex:1" />
                <a-select v-model:value="transportCurrency" style="width: 110px" show-search :options="currencyOptions" />
              </div>
            </label>
          </div>
        </a-card>

        <a-card class="crm-shell-card" :bordered="false">
          <template #title><div class="card-title"><ToolOutlined /> {{ t('sales.uslugi') }}</div></template>
          <div class="add-line">
            <a-select
              v-model:value="serviceToAdd"
              show-search option-filter-prop="label" style="min-width: 320px"
              :placeholder="t('sales.vyberiteUsluguIzPraysa')"
              :options="serviceOptions"
            />
            <a-button type="primary" :disabled="!serviceToAdd" @click="addServiceFromCatalog"><PlusOutlined /> {{ t('sales.dobavit') }}</a-button>
            <a-button @click="addCustomService">{{ t('sales.svoyaUsluga') }}</a-button>
          </div>
          <a-table v-if="serviceLines.length" :columns="serviceCols" :data-source="serviceLines" :pagination="false" row-key="_k" size="small">
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'name'"><a-input v-model:value="record.name" /></template>
              <template v-else-if="column.key === 'unit'"><a-input v-model:value="record.unit" style="width: 80px" /></template>
              <template v-else-if="column.key === 'price'"><a-input-number v-model:value="record.unitPrice" :min="0" style="width: 120px" /></template>
              <template v-else-if="column.key === 'qty'"><a-input-number v-model:value="record.quantity" :min="0" style="width: 80px" /></template>
              <template v-else-if="column.key === 'disc'"><a-input-number v-model:value="record.discountPercent" :min="0" :max="100" style="width: 70px" /></template>
              <template v-else-if="column.key === 'del'"><a-button type="text" danger size="small" @click="serviceLines.splice(index, 1)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><DeleteOutlined /></a-button></template>
            </template>
          </a-table>
        </a-card>

        <a-card class="crm-shell-card" :bordered="false">
          <template #title><div class="card-title"><GoldOutlined /> {{ t('sales.tovaryTpin') }}</div></template>
          <a-button type="primary" style="margin-bottom: 12px" @click="addGoods"><PlusOutlined /> {{ t('sales.dobavitTovar') }}</a-button>
          <a-table v-if="goodsLines.length" :columns="goodsCols" :data-source="goodsLines" :pagination="false" row-key="_k" size="small" :scroll="{ x: 760 }">
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'desc'"><a-input v-model:value="record.description" :placeholder="t('sales.naimenovanie')" /></template>
              <template v-else-if="column.key === 'code'">
                <a-input-group compact style="display: flex; width: 172px">
                  <a-input v-model:value="record.code" placeholder="10 знаков" style="width: 130px" @blur="fillUnit(record)" />
                  <a-button style="width: 42px" :title="t('sales.spravochnikTnVedPoisk')" @click="openTnvedPicker(index)">
                    <BookOutlined />
                  </a-button>
                </a-input-group>
              </template>
              <template v-else-if="column.key === 'val'"><a-input-number v-model:value="record.customsValue" :min="0" style="width: 120px" /></template>
              <template v-else-if="column.key === 'cur'">
                <div class="inline-field inline-field--stack">
                  <a-select v-model:value="record.currencyCode" style="width: 100px" show-search :options="currencyOptions" />
                  <span v-if="rateFor(record.currencyCode)" class="rate-hint z-num">{{ rateFor(record.currencyCode) }} ₸</span>
                </div>
              </template>
              <template v-else-if="column.key === 'weight'"><a-input-number v-model:value="record.weightKg" :min="0" style="width: 90px" /></template>
              <template v-else-if="column.key === 'country'">
                <a-select v-model:value="record.originCountry" show-search allow-clear style="width: 150px"
                  :options="countryOptions" :filter-option="filterOption" :placeholder="t('sales.calcOriginCountry')" />
              </template>
              <template v-else-if="column.key === 'unit'"><a-input v-model:value="record.unit" :placeholder="t('sales.sht')" style="width: 80px" /></template>
              <template v-else-if="column.key === 'del'"><a-button type="text" danger size="small" @click="goodsLines.splice(index, 1)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><DeleteOutlined /></a-button></template>
            </template>
          </a-table>
          <p class="muted" style="margin-top: 8px">{{ t('sales.poshlinaNdsISbory') }}</p>
        </a-card>

        <TnvedPickerModal v-model:open="tnvedPickerOpen" :initial-query="tnvedPickerQuery" @select="onTnvedPick" />

        <div class="calc-actions">
          <a-button type="primary" size="large" :loading="calculating" @click="calculate"><CalculatorOutlined /> {{ t('sales.rasschitat') }}</a-button>
          <a-button v-if="result" size="large" :disabled="!clientName.trim()" :loading="saving" @click="saveQuote"><SaveOutlined /> {{ t('sales.sohranitKakKp') }}</a-button>
        </div>

        <a-card v-if="result" class="crm-shell-card result-card" :bordered="false">
          <template #title><div class="card-title"><FileDoneOutlined /> {{ t('sales.itog') }}</div></template>
          <div class="result-totals">
            <div class="total-box"><span>{{ t('sales.uslugi') }}</span><strong class="z-num">{{ money(result.servicesTotal) }} ₸</strong></div>
            <div class="total-box"><span>{{ t('sales.tpin') }}</span><strong class="z-num">{{ money(result.tpinTotal) }} ₸</strong></div>
            <div class="total-box grand"><span>{{ t('sales.itogo') }}</span><strong class="z-num">{{ money(result.grandTotal) }} ₸</strong></div>
          </div>
          <div v-if="result.goods.some(g => g.error)" class="calc-errors">
            <a-alert v-for="(g, i) in result.goods.filter(x => x.error)" :key="i" type="warning" show-icon :message="`${g.code || 'Товар'}: ${g.error}`" style="margin-bottom: 6px" />
          </div>
          <a-table v-if="result.goods.length" :columns="resGoodsCols" :data-source="result.goods" :pagination="false" row-key="code" size="small" :scroll="{ x: 700 }">
            <template #bodyCell="{ column, record }">
              <template v-if="['duty','ad','excise','fee','vat','tpin','val'].includes(column.key)"><span class="z-num">{{ money(record[colField(column.key)] ?? 0) }}</span></template>
            </template>
          </a-table>
          <!-- Данные КЕДЕН по товарам: ставка по стране, выбор вида акциза и антидемпинга (пересчёт сразу). -->
          <div v-for="(g, gi) in result.goods" :key="'kd' + gi" class="kd-goods">
            <template v-if="g.notes || (g.exciseOptions?.length ?? 0) > 1 || g.antiDumpingOptions?.length">
              <div class="kd-title">{{ g.code }} — {{ g.description }}</div>
              <p v-if="g.notes" class="muted kd-notes">{{ g.notes }}</p>
              <div v-if="(g.exciseOptions?.length ?? 0) > 1" class="kd-choice">
                <span class="kd-label">{{ t('dt.tariffExciseKind') }}</span>
                <a-select :value="g.exciseKind" size="small" style="min-width: 320px; max-width: 100%"
                  :options="g.exciseOptions!.map((o) => ({ value: o.key, label: `${o.rate} — ${o.condition ?? ''}` }))"
                  @change="(v: string) => { if (goodsLines[gi]) { goodsLines[gi].exciseKind = v; calculate() } }" />
              </div>
              <div v-if="g.antiDumpingOptions?.length" class="kd-choice">
                <span class="kd-label">{{ t('dt.tariffAntiDumping') }}</span>
                <a-select :value="goodsLines[gi]?.antiDumpingKind ?? ''" size="small" style="min-width: 320px; max-width: 100%"
                  :options="[{ value: '', label: t('dt.tariffAntiDumpingNone') },
                             ...g.antiDumpingOptions!.map((o) => ({ value: o.key, label: `${o.rate} (${o.country ?? ''}) — ${o.condition ?? ''}` }))]"
                  @change="(v: string) => { if (goodsLines[gi]) { goodsLines[gi].antiDumpingKind = v || null; calculate() } }" />
              </div>
            </template>
          </div>
        </a-card>
      </div>
    </template>

    <!-- МОИ КП -->
    <template v-else>
      <a-card class="crm-shell-card" :bordered="false">
        <a-table :columns="quoteCols" :data-source="quotes" :loading="quotesLoading" row-key="id" :pagination="{ pageSize: 12 }">
          <template #emptyText><a-empty :description="t('sales.kpPokaNet')" /></template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'num'">{{ t('sales.kpNumber', { n: record.number, y: record.year }) }}</template>
            <template v-else-if="column.key === 'total'"><span class="z-num">{{ money(record.grandTotal) }} ₸</span></template>
            <template v-else-if="column.key === 'status'"><a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag></template>
            <template v-else-if="column.key === 'date'">{{ formatDate(record.createdAtUtc) }}</template>
            <template v-else-if="column.key === 'act'">
              <a-button size="small" @click="openQuote(record.id)">{{ t('sales.otkryt') }}</a-button>
            </template>
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- Деталь КП -->
    <a-modal v-model:open="quoteModalOpen" :title="activeQuote ? t('misc.kpNomer', { n: activeQuote.number, y: activeQuote.year }) : ''" width="760px" :footer="null">
      <template v-if="activeQuote">
        <div class="quote-detail">
          <p><strong>{{ t('sales.klient2') }}</strong> {{ activeQuote.clientName }} <span v-if="activeQuote.clientContact">· {{ activeQuote.clientContact }}</span></p>
          <p v-if="activeQuote.comment" class="muted">{{ activeQuote.comment }}</p>
          <div class="result-totals">
            <div class="total-box"><span>{{ t('sales.uslugi') }}</span><strong class="z-num">{{ money(activeQuote.servicesTotal) }} ₸</strong></div>
            <div class="total-box"><span>{{ t('sales.tpin') }}</span><strong class="z-num">{{ money(activeQuote.tpinTotal) }} ₸</strong></div>
            <div class="total-box grand"><span>{{ t('sales.itogo') }}</span><strong class="z-num">{{ money(activeQuote.grandTotal) }} ₸</strong></div>
          </div>
          <div class="quote-modal-actions">
            <a-button type="primary" @click="printQuote(activeQuote)"><PrinterOutlined /> {{ t('sales.pechatPdf') }}</a-button>
            <a-select :value="activeQuote.status" style="width: 180px" :options="statusOptions" @change="(v: number) => updateStatus(activeQuote!.id, v)" />
          </div>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import { message } from '@/ui/message'
import {
  BookOutlined, CalculatorOutlined, DeleteOutlined, FileDoneOutlined, GoldOutlined, PlusOutlined,
  PrinterOutlined, SaveOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons-vue'
import TnvedPickerModal from '@/components/TnvedPickerModal.vue'
import {
  salesApi, SALES_QUOTE_STATUS_CODES,
  type SalesCalcResponse, type SalesQuoteDto, type SalesQuoteListItem, type SalesServiceItem,
} from '@/api/sales'
import { tnvedApi } from '@/api/tnved'
import { referencesApi } from '@/api/references'
import type { TnvedCurrencyDto } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import { useAuthStore } from '@/stores/auth'
import atgLogoSvgRaw from '@/assets/atg-logo-group.svg?raw'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

const classifiers = useClassifiersStore()
const authStore = useAuthStore()

// Руководителю и админу список показывает КП всех продажников, а не только свои
// (аудит 2026-09-28, раздел 8) — вкладка так и должна называться.
const isAllQuotes = computed(() => (authStore.role || '').trim().toLowerCase() === 'administrator' || authStore.hasBusinessRole('rop'))

const tab = ref<'calc' | 'quotes'>('calc')

// клиент
const clientName = ref('')
const clientContact = ref('')
const comment = ref('')
const incoterms = ref<string | undefined>()
const transportCost = ref<number | null>(null)
const transportCurrency = ref<string>('USD')

// услуги
const services = ref<SalesServiceItem[]>([])
const serviceToAdd = ref<string | undefined>()
const serviceOptions = computed(() =>
  services.value.map((s) => ({ value: s.id, label: `${s.name} — ${money(s.price)} ₸ / ${s.unit}` })),
)
let lineKey = 0
const serviceLines = ref<Array<{ _k: number; name: string; unit: string; unitPrice: number; quantity: number; discountPercent: number }>>([])
const addServiceFromCatalog = () => {
  const s = services.value.find((x) => x.id === serviceToAdd.value)
  if (!s) return
  serviceLines.value.push({ _k: lineKey++, name: s.name, unit: s.unit, unitPrice: s.price, quantity: 1, discountPercent: 0 })
  serviceToAdd.value = undefined
}
const addCustomService = () =>
  serviceLines.value.push({ _k: lineKey++, name: '', unit: t('sales.usluga'), unitPrice: 0, quantity: 1, discountPercent: 0 })

// товары
const goodsLines = ref<Array<{ _k: number; description: string; code: string; customsValue: number; currencyCode: string; weightKg: number | null; unit: string;
  originCountry?: string | null; exciseKind?: string | null; antiDumpingKind?: string | null }>>([])
const addGoods = () =>
  goodsLines.value.push({ _k: lineKey++, description: '', code: '', customsValue: 0, currencyCode: 'USD', weightKg: null, unit: '' })

// Страна происхождения (ОКСМ) — ставки по соглашениям о свободной торговле и антидемпинг из КЕДЕН.
const countryOptions = ref<{ value: string; label: string }[]>([])
const filterOption = (input: string, option: { label: string }) => option.label.toLowerCase().includes(input.toLowerCase())
referencesApi.listCountries()
  .then((list) => { countryOptions.value = list.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })) })
  .catch(() => {})

// Справочник ТН ВЭД для строки товара: открываем поиск, предзаполняя текущим кодом
// (в т.ч. неполным 6-значным — пикер сразу покажет подходящие 10-значные коды).
const tnvedPickerOpen = ref(false)
const tnvedPickerQuery = ref('')
const tnvedPickerIndex = ref(-1)
const openTnvedPicker = (index: number) => {
  tnvedPickerIndex.value = index
  tnvedPickerQuery.value = (goodsLines.value[index]?.code || '').trim()
  tnvedPickerOpen.value = true
}
const onTnvedPick = (payload: { code: string; name: string }) => {
  const row = goodsLines.value[tnvedPickerIndex.value]
  if (!row) return
  row.code = payload.code
  if (!row.description) row.description = payload.name
  fillUnit(row)
}

// автоподстановка единицы измерения по коду ТНВЭД (не перезатирает ручной ввод)
const fillUnit = async (record: { code: string; unit: string }) => {
  const code = record.code?.trim()
  if (!code || record.unit) return
  try {
    const { data } = await tnvedApi.node(code)
    if (data?.unitShort) record.unit = data.unitShort
  } catch { /* код не найден — оставляем пустым */ }
}

const serviceCols = computed(() => ([

  { title: t('sales.usluga2'), key: 'name' }, { title: t('sales.ed'), key: 'unit' }, { title: t('sales.cena'), key: 'price' },
  { title: t('sales.kolVo'), key: 'qty' }, { title: t('sales.skidka'), key: 'disc' }, { title: '', key: 'del', width: 50 },
]))
const goodsCols = computed(() => ([

  { title: t('sales.naimenovanie'), key: 'desc' }, { title: t('sales.tnved'), key: 'code' }, { title: t('sales.stoimost'), key: 'val' },
  { title: t('sales.valyuta'), key: 'cur' }, { title: t('sales.vesKg'), key: 'weight' }, { title: t('sales.calcOriginCountry'), key: 'country' },
  { title: t('sales.ed'), key: 'unit' },
  { title: '', key: 'del', width: 50 },
]))
const resGoodsCols = computed(() => ([

  { title: t('sales.tovar'), dataIndex: 'description', key: 'descr' }, { title: t('sales.tnved'), dataIndex: 'code', key: 'codec' },
  { title: t('sales.stoimost2'), key: 'val' }, { title: t('sales.poshlina'), key: 'duty' },
  ...(result.value?.goods.some((g) => (g.antiDumpingKzt ?? 0) > 0) ? [{ title: t('sales.calcAntiDumping'), key: 'ad' }] : []),
  { title: t('sales.akciz'), key: 'excise' },
  { title: t('sales.sbor'), key: 'fee' }, { title: t('sales.nds'), key: 'vat' }, { title: t('sales.tpin'), key: 'tpin' },
]))
const colField = (k: string) =>
  ({ val: 'customsValueKzt', duty: 'importDutyKzt', ad: 'antiDumpingKzt', excise: 'exciseKzt', fee: 'customsFeeKzt', vat: 'vatKzt', tpin: 'tpinTotalKzt' }[k] as string)

// расчёт
const calculating = ref(false)
const result = ref<SalesCalcResponse | null>(null)
const buildPayload = () => ({
  services: serviceLines.value.map(({ _k, ...rest }) => rest),
  goods: goodsLines.value.map(({ _k, ...rest }) => rest),
})
const calculate = async () => {
  calculating.value = true
  try {
    result.value = await salesApi.calculate(buildPayload())
  } catch {
    message.error(t('sales.oshibkaRascheta'))
  } finally {
    calculating.value = false
  }
}

// сохранение КП
const saving = ref(false)
const saveQuote = async () => {
  if (!clientName.value.trim()) return
  saving.value = true
  try {
    await salesApi.createQuote({
      clientName: clientName.value.trim(),
      clientContact: clientContact.value.trim(),
      comment: comment.value.trim(),
      incoterms: incoterms.value ?? null,
      transportCost: transportCost.value,
      transportCurrency: transportCurrency.value,
      ...buildPayload(),
    })
    message.success(t('sales.kpSohraneno'))
    await loadQuotes()
    tab.value = 'quotes'
  } catch {
    message.error(t('sales.neUdalosSohranitKp'))
  } finally {
    saving.value = false
  }
}

// КП список
const quotes = ref<SalesQuoteListItem[]>([])
const quotesLoading = ref(false)
const quoteCols = computed(() => ([

  { title: t('sales.nomer'), key: 'num', width: 140 }, { title: t('sales.klient3'), dataIndex: 'clientName', key: 'client' },
  { title: t('sales.summa'), key: 'total', width: 150 }, { title: t('sales.status'), key: 'status', width: 130 },
  { title: t('sales.avtor'), dataIndex: 'createdByName', key: 'author', width: 130 },
  { title: t('sales.data'), key: 'date', width: 110 }, { title: '', key: 'act', width: 100 },
]))
const loadQuotes = async () => {
  quotesLoading.value = true
  try { quotes.value = await salesApi.listQuotes() } finally { quotesLoading.value = false }
}

const quoteModalOpen = ref(false)
const activeQuote = ref<SalesQuoteDto | null>(null)
const openQuote = async (id: string) => {
  activeQuote.value = await salesApi.getQuote(id)
  quoteModalOpen.value = true
}
const statusOptions = SALES_QUOTE_STATUS_CODES.map((code, value) => ({ label: t(`enum.salesQuoteStatus.${code}`), value }))
const updateStatus = async (id: string, status: number) => {
  await salesApi.changeStatus(id, status)
  if (activeQuote.value) activeQuote.value.status = status
  await loadQuotes()
  message.success(t('sales.statusObnovlen'))
}

// валюты НБ РК
const currencies = ref<TnvedCurrencyDto[]>([])
const currencyOptions = computed(() =>
  currencies.value.map((c) => ({
    value: c.codeLat,
    label: `${c.codeLat} — ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(c.rate)} ₸`,
  })),
)
const rateFor = (code: string) => {
  const c = currencies.value.find((x) => x.codeLat === code)
  return c ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(c.rate) : null
}

// утилиты
const money = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v ?? 0)
const formatDate = (v: string) => new Intl.DateTimeFormat('ru-RU').format(new Date(v))
const statusLabel = (s: number) => {
  const code = SALES_QUOTE_STATUS_CODES[s]
  return code ? t(`enum.salesQuoteStatus.${code}`) : '—'
}
const statusColor = (s: number) => (['default', 'processing', 'success', 'error'][s] ?? 'default')

// печать КП в изолированном окне
const logoDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(atgLogoSvgRaw)}`
const printQuote = (q: SalesQuoteDto) => {
  const svc = q.serviceLines
    .map((s) => `<tr><td>${esc(s.name)}</td><td style="text-align:right">${money(s.unitPrice)}</td><td style="text-align:center">${s.quantity} ${esc(s.unit)}</td><td style="text-align:center">${s.discountPercent}%</td><td style="text-align:right">${money(s.total)} ₸</td></tr>`)
    .join('')
  const goods = q.goodsLines
    .map((g) => `<tr><td>${esc(g.description || g.code)}</td><td>${esc(g.code)}</td><td style="text-align:right">${money(g.importDutyKzt)}</td><td style="text-align:right">${money(g.antiDumpingKzt ?? 0)}</td><td style="text-align:right">${money(g.exciseKzt)}</td><td style="text-align:right">${money(g.vatKzt)}</td><td style="text-align:right">${money(g.customsFeeKzt)}</td><td style="text-align:right">${money(g.tpinTotalKzt)} ₸</td></tr>`)
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>КП ${q.number}/КП/${q.year}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#1a2332;padding:40px;max-width:760px;margin:0 auto}
    h1{font-size:22px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:24px}
    .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--z-teal);padding-bottom:16px;margin-bottom:20px}
    .brand b{font-size:18px} table{width:100%;border-collapse:collapse;margin:14px 0}
    th,td{border:1px solid #d6dce5;padding:7px 10px;font-size:13px} th{background:#eef3f8;text-align:left}
    h3{font-size:14px;margin:18px 0 6px} .totals{margin-top:18px;text-align:right}
    .totals div{margin:4px 0} .grand{font-size:18px;font-weight:800;color:#1a2332}
    .muted{color:#6b7280} .foot{margin-top:30px;color:#6b7280;font-size:12px}
  </style></head><body>
    <div class="brand">
      <div><img src="${logoDataUri}" alt="" style="height:160px;width:auto;display:block"></div>
      <div style="text-align:right"><b>КП № ${q.number}/КП/${q.year}</b><div class="muted">${formatDate(q.createdAtUtc)}</div></div></div>
    <h1>Коммерческое предложение</h1>
    <div class="sub">Для: <b>${esc(q.clientName)}</b>${q.clientContact ? ' · ' + esc(q.clientContact) : ''}</div>
    ${q.comment ? `<p class="muted">${esc(q.comment)}</p>` : ''}
    ${svc ? `${t('sales.printUslugiHdr')}</thead><tbody>${svc}</tbody></table>` : ''}
    ${goods ? `${t('sales.printTpinHdr')}</thead><tbody>${goods}</tbody></table>` : ''}
    <div class="totals">
      <div>Услуги: <b>${money(q.servicesTotal)} ₸</b></div>
      <div>Таможенные платежи: <b>${money(q.tpinTotal)} ₸</b></div>
      <div class="grand">Итого: ${money(q.grandTotal)} ₸</div>
    </div>
    <div class="foot">Предложение носит предварительный характер. Окончательная стоимость определяется по факту оформления.</div>
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) {
    message.warning(t('sales.razreshiteVsplyvayuschieOknaV'))
    URL.revokeObjectURL(url)
    return
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
const esc = (s: string) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

onMounted(async () => {
  try { services.value = await salesApi.listServices() } catch { /* ignore */ }
  try { currencies.value = (await tnvedApi.currencies()).data } catch { /* ignore */ }
  try { await classifiers.load('incoterms') } catch { /* ignore */ }
  await loadQuotes()
})
</script>

<style scoped>
.sales-page { display: flex; flex-direction: column; gap: var(--sp-4); }
.sales-stack { display: flex; flex-direction: column; gap: var(--sp-4); }
.card-title { display: flex; align-items: center; gap: 9px; color: var(--z-ink); font-family: var(--font-heading); font-weight: 800; }
.card-title :deep(.anticon) { color: var(--z-teal-d); }
.client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.client-grid label { display: flex; flex-direction: column; gap: 6px; }
.client-grid label.full { grid-column: 1 / -1; }
.client-grid span { color: var(--z-navy-3); font-size: 12px; font-weight: 700; }
.inline-field { display: flex; gap: 8px; }
.inline-field--stack { flex-direction: column; gap: 2px; }
.rate-hint { font-size: 12px; color: var(--z-muted); }
.add-line { display: flex; gap: 10px; margin-bottom: var(--sp-3); flex-wrap: wrap; }
.muted { color: var(--z-muted); font-size: 12.5px; }
.calc-actions { display: flex; gap: var(--sp-3); }
.z-num { font-variant-numeric: tabular-nums; }

/* Панель "Итог" — акцентный фокус экрана */
:not(#z) .result-card { border: 1px solid var(--z-teal); background: var(--z-teal-soft); box-shadow: var(--sh-2); }
.result-card :deep(.ant-card-head) { border-bottom-color: rgba(31, 168, 192, 0.25); }
.result-card .card-title :deep(.anticon) { color: var(--z-teal-d); }
.result-totals { display: flex; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-4); }
.total-box { flex: 1; min-width: 160px; padding: var(--sp-4); border: 1px solid var(--z-line); border-radius: var(--r-lg); background: var(--z-surface); }
.total-box span { display: block; color: var(--z-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
.total-box strong { display: block; margin-top: 6px; font-family: var(--font-heading); font-size: 20px; font-weight: 800; color: var(--z-ink); }
.total-box.grand { border-color: var(--z-teal); border-width: 2px; background: var(--z-surface); box-shadow: var(--sh-1); }
.total-box.grand strong { font-size: 28px; color: var(--z-teal-d); }
.quote-detail p { margin: 4px 0; }
.quote-modal-actions { display: flex; gap: 12px; align-items: center; margin-top: 16px; }
@media (max-width: 900px) { .client-grid { grid-template-columns: 1fr; } }
.kd-goods + .kd-goods { margin-top: 10px; }
.kd-title { font-weight: 600; font-size: 13px; margin-top: 12px; }
.kd-notes { margin: 2px 0 6px; font-size: 12.5px; }
.kd-choice { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-bottom: 6px; }
.kd-label { font-size: 13px; font-weight: 500; color: var(--z-ink-2); }
</style>
