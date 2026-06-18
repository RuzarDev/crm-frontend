<template>
  <div class="sales-page crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Модуль продаж</div>
        <h1 class="crm-page-title">Продажи</h1>
        <p class="crm-page-subtitle">Калькулятор услуг и ТПиН, коммерческие предложения.</p>
      </div>
    </div>

    <a-tabs v-model:activeKey="tab">
      <a-tab-pane key="calc" tab="Калькулятор" />
      <a-tab-pane key="quotes" tab="Мои КП" />
    </a-tabs>

    <!-- КАЛЬКУЛЯТОР -->
    <template v-if="tab === 'calc'">
      <a-card class="crm-shell-card" :bordered="false">
        <template #title><div class="card-title"><UserOutlined /> Клиент</div></template>
        <div class="client-grid">
          <label><span>Клиент *</span><a-input v-model:value="clientName" placeholder="Название компании" /></label>
          <label><span>Контакт</span><a-input v-model:value="clientContact" placeholder="Телефон / e-mail" /></label>
          <label class="full"><span>Комментарий</span><a-input v-model:value="comment" placeholder="Примечание к расчёту" /></label>
        </div>
      </a-card>

      <a-card class="crm-shell-card" :bordered="false" style="margin-top: 16px">
        <template #title><div class="card-title"><ToolOutlined /> Услуги</div></template>
        <div class="add-line">
          <a-select
            v-model:value="serviceToAdd"
            show-search option-filter-prop="label" style="min-width: 320px"
            placeholder="Выберите услугу из прайса"
            :options="serviceOptions"
          />
          <a-button type="primary" :disabled="!serviceToAdd" @click="addServiceFromCatalog"><PlusOutlined /> Добавить</a-button>
          <a-button @click="addCustomService">Своя услуга</a-button>
        </div>
        <a-table v-if="serviceLines.length" :columns="serviceCols" :data-source="serviceLines" :pagination="false" row-key="_k" size="small">
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'name'"><a-input v-model:value="record.name" /></template>
            <template v-else-if="column.key === 'unit'"><a-input v-model:value="record.unit" style="width: 80px" /></template>
            <template v-else-if="column.key === 'price'"><a-input-number v-model:value="record.unitPrice" :min="0" style="width: 120px" /></template>
            <template v-else-if="column.key === 'qty'"><a-input-number v-model:value="record.quantity" :min="0" style="width: 80px" /></template>
            <template v-else-if="column.key === 'disc'"><a-input-number v-model:value="record.discountPercent" :min="0" :max="100" style="width: 70px" /></template>
            <template v-else-if="column.key === 'del'"><a-button type="text" danger size="small" @click="serviceLines.splice(index, 1)"><DeleteOutlined /></a-button></template>
          </template>
        </a-table>
      </a-card>

      <a-card class="crm-shell-card" :bordered="false" style="margin-top: 16px">
        <template #title><div class="card-title"><GoldOutlined /> Товары (ТПиН)</div></template>
        <a-button type="primary" style="margin-bottom: 12px" @click="addGoods"><PlusOutlined /> Добавить товар</a-button>
        <a-table v-if="goodsLines.length" :columns="goodsCols" :data-source="goodsLines" :pagination="false" row-key="_k" size="small" :scroll="{ x: 760 }">
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'desc'"><a-input v-model:value="record.description" placeholder="Наименование" /></template>
            <template v-else-if="column.key === 'code'"><a-input v-model:value="record.code" placeholder="10 знаков" style="width: 130px" /></template>
            <template v-else-if="column.key === 'val'"><a-input-number v-model:value="record.customsValue" :min="0" style="width: 120px" /></template>
            <template v-else-if="column.key === 'cur'">
              <div style="display:flex;flex-direction:column;gap:2px">
                <a-select v-model:value="record.currencyCode" style="width: 100px" show-search :options="currencyOptions" />
                <span v-if="rateFor(record.currencyCode)" style="font-size:11px;color:var(--atg-muted)">{{ rateFor(record.currencyCode) }} ₸</span>
              </div>
            </template>
            <template v-else-if="column.key === 'weight'"><a-input-number v-model:value="record.weightKg" :min="0" style="width: 90px" /></template>
            <template v-else-if="column.key === 'del'"><a-button type="text" danger size="small" @click="goodsLines.splice(index, 1)"><DeleteOutlined /></a-button></template>
          </template>
        </a-table>
        <p class="muted" style="margin-top: 8px">Пошлина, НДС и сборы считаются автоматически по коду ТНВЭД.</p>
      </a-card>

      <div class="calc-actions">
        <a-button type="primary" size="large" :loading="calculating" @click="calculate"><CalculatorOutlined /> Рассчитать</a-button>
        <a-button v-if="result" size="large" :disabled="!clientName.trim()" :loading="saving" @click="saveQuote"><SaveOutlined /> Сохранить как КП</a-button>
      </div>

      <a-card v-if="result" class="crm-shell-card result-card" :bordered="false" style="margin-top: 16px">
        <template #title><div class="card-title"><FileDoneOutlined /> Результат расчёта</div></template>
        <div class="result-totals">
          <div class="total-box"><span>Услуги</span><strong>{{ money(result.servicesTotal) }} ₸</strong></div>
          <div class="total-box"><span>ТПиН</span><strong>{{ money(result.tpinTotal) }} ₸</strong></div>
          <div class="total-box grand"><span>Итого</span><strong>{{ money(result.grandTotal) }} ₸</strong></div>
        </div>
        <div v-if="result.goods.some(g => g.error)" class="calc-errors">
          <a-alert v-for="(g, i) in result.goods.filter(x => x.error)" :key="i" type="warning" show-icon :message="`${g.code || 'Товар'}: ${g.error}`" style="margin-bottom: 6px" />
        </div>
        <a-table v-if="result.goods.length" :columns="resGoodsCols" :data-source="result.goods" :pagination="false" row-key="code" size="small" :scroll="{ x: 700 }">
          <template #bodyCell="{ column, record }">
            <template v-if="['duty','excise','fee','vat','tpin','val'].includes(column.key)">{{ money(record[colField(column.key)]) }}</template>
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- МОИ КП -->
    <template v-else>
      <a-card class="crm-shell-card" :bordered="false">
        <a-table :columns="quoteCols" :data-source="quotes" :loading="quotesLoading" row-key="id" :pagination="{ pageSize: 12 }">
          <template #emptyText><a-empty description="КП пока нет" /></template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'num'">{{ record.number }}/КП/{{ record.year }}</template>
            <template v-else-if="column.key === 'total'">{{ money(record.grandTotal) }} ₸</template>
            <template v-else-if="column.key === 'status'"><a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag></template>
            <template v-else-if="column.key === 'date'">{{ formatDate(record.createdAtUtc) }}</template>
            <template v-else-if="column.key === 'act'">
              <a-button size="small" @click="openQuote(record.id)">Открыть</a-button>
            </template>
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- Деталь КП -->
    <a-modal v-model:open="quoteModalOpen" :title="activeQuote ? `КП № ${activeQuote.number}/КП/${activeQuote.year}` : ''" width="760px" :footer="null">
      <template v-if="activeQuote">
        <div class="quote-detail">
          <p><strong>Клиент:</strong> {{ activeQuote.clientName }} <span v-if="activeQuote.clientContact">· {{ activeQuote.clientContact }}</span></p>
          <p v-if="activeQuote.comment" class="muted">{{ activeQuote.comment }}</p>
          <div class="result-totals">
            <div class="total-box"><span>Услуги</span><strong>{{ money(activeQuote.servicesTotal) }} ₸</strong></div>
            <div class="total-box"><span>ТПиН</span><strong>{{ money(activeQuote.tpinTotal) }} ₸</strong></div>
            <div class="total-box grand"><span>Итого</span><strong>{{ money(activeQuote.grandTotal) }} ₸</strong></div>
          </div>
          <div class="quote-modal-actions">
            <a-button type="primary" @click="printQuote(activeQuote)"><PrinterOutlined /> Печать / PDF</a-button>
            <a-select :value="activeQuote.status" style="width: 180px" :options="statusOptions" @change="(v: number) => updateStatus(activeQuote!.id, v)" />
          </div>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  CalculatorOutlined, DeleteOutlined, FileDoneOutlined, GoldOutlined, PlusOutlined,
  PrinterOutlined, SaveOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons-vue'
import {
  salesApi, SALES_QUOTE_STATUS,
  type SalesCalcResponse, type SalesQuoteDto, type SalesQuoteListItem, type SalesServiceItem,
} from '@/api/sales'
import { tnvedApi } from '@/api/tnved'
import type { TnvedCurrencyDto } from '@/types/api'
import atgLogoSvgRaw from '@/assets/atg-logo-group.svg?raw'

const tab = ref<'calc' | 'quotes'>('calc')

// клиент
const clientName = ref('')
const clientContact = ref('')
const comment = ref('')

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
  serviceLines.value.push({ _k: lineKey++, name: '', unit: 'услуга', unitPrice: 0, quantity: 1, discountPercent: 0 })

// товары
const goodsLines = ref<Array<{ _k: number; description: string; code: string; customsValue: number; currencyCode: string; weightKg: number | null }>>([])
const addGoods = () =>
  goodsLines.value.push({ _k: lineKey++, description: '', code: '', customsValue: 0, currencyCode: 'USD', weightKg: null })

const serviceCols = [
  { title: 'Услуга', key: 'name' }, { title: 'Ед.', key: 'unit' }, { title: 'Цена', key: 'price' },
  { title: 'Кол-во', key: 'qty' }, { title: 'Скидка %', key: 'disc' }, { title: '', key: 'del', width: 50 },
]
const goodsCols = [
  { title: 'Наименование', key: 'desc' }, { title: 'ТНВЭД', key: 'code' }, { title: 'Стоимость', key: 'val' },
  { title: 'Валюта', key: 'cur' }, { title: 'Вес, кг', key: 'weight' }, { title: '', key: 'del', width: 50 },
]
const resGoodsCols = [
  { title: 'Товар', dataIndex: 'description', key: 'descr' }, { title: 'ТНВЭД', dataIndex: 'code', key: 'codec' },
  { title: 'Стоимость ₸', key: 'val' }, { title: 'Пошлина', key: 'duty' }, { title: 'Акциз', key: 'excise' },
  { title: 'Сбор', key: 'fee' }, { title: 'НДС', key: 'vat' }, { title: 'ТПиН', key: 'tpin' },
]
const colField = (k: string) =>
  ({ val: 'customsValueKzt', duty: 'importDutyKzt', excise: 'exciseKzt', fee: 'customsFeeKzt', vat: 'vatKzt', tpin: 'tpinTotalKzt' }[k] as string)

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
    message.error('Ошибка расчёта')
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
      ...buildPayload(),
    })
    message.success('КП сохранено')
    await loadQuotes()
    tab.value = 'quotes'
  } catch {
    message.error('Не удалось сохранить КП')
  } finally {
    saving.value = false
  }
}

// КП список
const quotes = ref<SalesQuoteListItem[]>([])
const quotesLoading = ref(false)
const quoteCols = [
  { title: 'Номер', key: 'num', width: 140 }, { title: 'Клиент', dataIndex: 'clientName', key: 'client' },
  { title: 'Сумма', key: 'total', width: 150 }, { title: 'Статус', key: 'status', width: 130 },
  { title: 'Автор', dataIndex: 'createdByName', key: 'author', width: 130 },
  { title: 'Дата', key: 'date', width: 110 }, { title: '', key: 'act', width: 100 },
]
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
const statusOptions = SALES_QUOTE_STATUS.map((label, value) => ({ label, value }))
const updateStatus = async (id: string, status: number) => {
  await salesApi.changeStatus(id, status)
  if (activeQuote.value) activeQuote.value.status = status
  await loadQuotes()
  message.success('Статус обновлён')
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
const statusLabel = (s: number) => SALES_QUOTE_STATUS[s] ?? '—'
const statusColor = (s: number) => (['default', 'processing', 'success', 'error'][s] ?? 'default')

// печать КП в изолированном окне
const logoDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(atgLogoSvgRaw)}`
const printQuote = (q: SalesQuoteDto) => {
  const svc = q.serviceLines
    .map((s) => `<tr><td>${esc(s.name)}</td><td style="text-align:right">${money(s.unitPrice)}</td><td style="text-align:center">${s.quantity} ${esc(s.unit)}</td><td style="text-align:center">${s.discountPercent}%</td><td style="text-align:right">${money(s.total)} ₸</td></tr>`)
    .join('')
  const goods = q.goodsLines
    .map((g) => `<tr><td>${esc(g.description || g.code)}</td><td>${esc(g.code)}</td><td style="text-align:right">${money(g.importDutyKzt)}</td><td style="text-align:right">${money(g.vatKzt)}</td><td style="text-align:right">${money(g.customsFeeKzt)}</td><td style="text-align:right">${money(g.tpinTotalKzt)} ₸</td></tr>`)
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>КП ${q.number}/КП/${q.year}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#1a2332;padding:40px;max-width:760px;margin:0 auto}
    h1{font-size:22px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:24px}
    .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2BBCD4;padding-bottom:16px;margin-bottom:20px}
    .brand b{font-size:18px} table{width:100%;border-collapse:collapse;margin:14px 0}
    th,td{border:1px solid #d6dce5;padding:7px 10px;font-size:13px} th{background:#eef3f8;text-align:left}
    h3{font-size:14px;margin:18px 0 6px} .totals{margin-top:18px;text-align:right}
    .totals div{margin:4px 0} .grand{font-size:18px;font-weight:800;color:#1a2332}
    .muted{color:#6b7280} .foot{margin-top:30px;color:#6b7280;font-size:12px}
  </style></head><body>
    <div class="brand">
      <div><img src="${logoDataUri}" alt="" style="height:56px;width:auto;display:block"></div>
      <div style="text-align:right"><b>КП № ${q.number}/КП/${q.year}</b><div class="muted">${formatDate(q.createdAtUtc)}</div></div></div>
    <h1>Коммерческое предложение</h1>
    <div class="sub">Для: <b>${esc(q.clientName)}</b>${q.clientContact ? ' · ' + esc(q.clientContact) : ''}</div>
    ${q.comment ? `<p class="muted">${esc(q.comment)}</p>` : ''}
    ${svc ? `<h3>Услуги</h3><table><thead><tr><th>Услуга</th><th>Цена</th><th>Кол-во</th><th>Скидка</th><th>Сумма</th></tr></thead><tbody>${svc}</tbody></table>` : ''}
    ${goods ? `<h3>Таможенные платежи (ТПиН)</h3><table><thead><tr><th>Товар</th><th>ТНВЭД</th><th>Пошлина</th><th>НДС</th><th>Сбор</th><th>Итого</th></tr></thead><tbody>${goods}</tbody></table>` : ''}
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
    message.warning('Разрешите всплывающие окна в браузере для печати КП')
    URL.revokeObjectURL(url)
    return
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
const esc = (s: string) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

onMounted(async () => {
  try { services.value = await salesApi.listServices() } catch { /* ignore */ }
  try { currencies.value = (await tnvedApi.currencies()).data } catch { /* ignore */ }
  await loadQuotes()
})
</script>

<style scoped>
.sales-page { display: flex; flex-direction: column; gap: 14px; }
.card-title { display: flex; align-items: center; gap: 9px; color: var(--atg-ink); font-weight: 800; }
.card-title :deep(.anticon) { color: var(--atg-accent-strong); }
.client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.client-grid label { display: flex; flex-direction: column; gap: 6px; }
.client-grid label.full { grid-column: 1 / -1; }
.client-grid span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }
.add-line { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.muted { color: var(--atg-muted); font-size: 12.5px; }
.calc-actions { display: flex; gap: 12px; margin-top: 16px; }
.result-totals { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.total-box { flex: 1; min-width: 160px; padding: 14px 16px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); background: var(--atg-surface-muted, #f6f8fb); }
.total-box span { display: block; color: var(--atg-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
.total-box strong { display: block; margin-top: 6px; font-size: 20px; color: var(--atg-ink); }
.total-box.grand { border-color: var(--atg-accent); background: rgba(43,188,212,0.08); }
.quote-detail p { margin: 4px 0; }
.quote-modal-actions { display: flex; gap: 12px; align-items: center; margin-top: 16px; }
@media (max-width: 900px) { .client-grid { grid-template-columns: 1fr; } }
</style>
