<!-- Счета на услуги брокера и акты выполненных работ.
     До этого исходящих документов в системе не было вовсе: счёт и акт делались вне CRM,
     поэтому выручка брокера нигде не считалась (аудит 2026-09-23). -->
<template>
  <div class="billing-view crm-page">
    <PageHeader :kicker="t('billing.kicker')" :title="t('billing.title')" :subtitle="t('billing.subtitle')">
      <template #actions>
        <a-button v-if="canWrite" type="primary" @click="openCreate"><PlusOutlined /> {{ t('billing.newDoc') }}</a-button>
        <a-button :disabled="!filtered.length" @click="exportXlsx"><DownloadOutlined /> Excel</a-button>
        <a-button :loading="loading" @click="load">{{ t('billing.refresh') }}</a-button>
      </template>
    </PageHeader>

    <div class="kpi-row">
      <div class="kpi"><span>{{ t('billing.issued') }}</span><b>{{ money(totals.issued) }} ₸</b><small>{{ t('billing.issuedHint') }}</small></div>
      <div class="kpi kpi--ok"><span>{{ t('billing.paid') }}</span><b>{{ money(totals.paid) }} ₸</b><small>{{ t('billing.paidHint') }}</small></div>
      <div class="kpi kpi--warn"><span>{{ t('billing.awaiting') }}</span><b>{{ money(totals.awaiting) }} ₸</b><small>{{ t('billing.awaitingHint') }}</small></div>
      <div class="kpi"><span>{{ t('billing.drafts') }}</span><b>{{ totals.drafts }}</b><small>{{ t('billing.draftsHint') }}</small></div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="filters">
        <a-input v-model:value="search" allow-clear :placeholder="t('billing.searchPh')" style="max-width: 300px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-segmented v-model:value="kindFilter" :options="kindOptions" />
        <a-segmented v-model:value="statusFilter" :options="statusOptions" />
      </div>

      <a-table :columns="columns" :data-source="filtered" :loading="loading" row-key="id" size="middle"
        :pagination="filtered.length > 25 ? { pageSize: 25, showSizeChanger: false } : false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'doc'">
            <div class="cell-main">{{ record.kind === 'act' ? t('billing.act') : t('billing.invoice') }}
              {{ record.number ? `№ ${record.number}/${record.year}` : t('billing.draftNo') }}</div>
            <div class="cell-sub">{{ record.caseNumber || t('billing.noCase') }}</div>
          </template>
          <template v-else-if="column.key === 'client'">{{ record.clientName }}</template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'total'">
            <div class="cell-main">{{ money(record.total) }} ₸</div>
            <div class="cell-sub">{{ record.vatRate > 0 ? t('billing.inclVat', { rate: record.vatRate, sum: money(record.vatAmount) }) : t('billing.noVat') }}</div>
          </template>
          <template v-else-if="column.key === 'dates'">
            <div v-if="record.issuedAtUtc">{{ t('billing.issuedAt', { date: fmtDate(record.issuedAtUtc) }) }}</div>
            <div v-if="record.paidAtUtc" class="cell-sub">{{ t('billing.paidAt', { date: fmtDate(record.paidAtUtc) }) }}</div>
            <div v-else-if="record.dueDateUtc" class="cell-sub">{{ t('billing.dueAt', { date: fmtDate(record.dueDateUtc) }) }}</div>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space wrap>
              <a-button size="small" @click="downloadPdf(record)"><DownloadOutlined /> PDF</a-button>
              <a-button v-if="canWrite && record.status === 0" size="small" type="primary" @click="issue(record)">{{ t('billing.issueBtn') }}</a-button>
              <a-button v-if="canWrite && record.status === 1" size="small" @click="remind(record)">{{ t('billing.remind') }}</a-button>
              <a-button v-if="canWrite && record.status === 1" size="small" @click="markPaid(record)">{{ t('billing.markPaid') }}</a-button>
              <a-popconfirm v-if="canWrite && record.status === 0" :title="t('billing.deleteConfirm')" :ok-text="t('billing.delete')" :cancel-text="t('common.cancel')" @confirm="remove(record)">
                <a-button size="small" danger>{{ t('billing.delete') }}</a-button>
              </a-popconfirm>
              <a-popconfirm v-else-if="canWrite && record.status !== 3" :title="t('billing.cancelConfirm')" :ok-text="t('billing.cancelDoc')" :cancel-text="t('common.cancel')" @confirm="cancelDoc(record)">
                <a-button size="small" danger>{{ t('billing.cancelDoc') }}</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
        <template #emptyText><a-empty :description="t('billing.empty')" /></template>
      </a-table>
    </a-card>

    <!-- Создание счёта/акта -->
    <a-modal v-model:open="createOpen" :title="t('billing.newDoc')" :width="760" :confirm-loading="saving"
      :ok-text="t('billing.create')" :cancel-text="t('common.cancel')" :ok-button-props="{ disabled: !canSubmit }" @ok="submit">
      <a-form layout="vertical">
        <div class="form-grid">
          <a-form-item :label="t('billing.kind')">
            <a-select v-model:value="draft.kind" :options="kindSelectOptions" />
          </a-form-item>
          <a-form-item :label="t('billing.client')" required>
            <a-select v-model:value="draft.clientId" show-search option-filter-prop="label" :options="clientOptions" :placeholder="t('billing.clientPh')" />
          </a-form-item>
          <a-form-item :label="t('billing.case')">
            <a-select v-model:value="draft.caseId" allow-clear show-search option-filter-prop="label" :options="caseOptions" :placeholder="t('billing.casePh')" />
          </a-form-item>
          <a-form-item :label="t('billing.due')">
            <a-date-picker v-model:value="draft.dueDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" style="width: 100%" />
          </a-form-item>
        </div>

        <div class="sub-label">{{ t('billing.services') }}</div>
        <div v-for="(l, i) in draft.lines" :key="i" class="line-row">
          <a-select
            v-model:value="l.name" show-search allow-clear :options="tariffOptions" :placeholder="t('billing.servicePh')"
            style="flex: 1 1 260px" :filter-option="filterTariff" @change="(v: string) => applyTariff(l, v)"
          />
          <a-input v-model:value="l.unit" :placeholder="t('billing.unit')" style="width: 90px" />
          <a-input-number v-model:value="l.quantity" :min="0.01" :step="1" :placeholder="t('billing.qty')" style="width: 90px" />
          <a-input-number v-model:value="l.unitPrice" :min="0" :step="1000" :placeholder="t('billing.price')" style="width: 130px" />
          <span class="line-amount">{{ money((l.quantity || 0) * (l.unitPrice || 0)) }} ₸</span>
          <a-button type="text" danger size="small" @click="draft.lines.splice(i, 1)"><CloseOutlined /></a-button>
        </div>
        <a-button type="dashed" size="small" @click="draft.lines.push({ name: '', unit: '', quantity: 1, unitPrice: 0 })">
          {{ t('billing.addLine') }}
        </a-button>

        <a-form-item :label="t('billing.note')" class="note-field">
          <a-input v-model:value="draft.note" :placeholder="t('billing.notePh')" />
        </a-form-item>

        <div class="draft-total">
          {{ t('billing.draftTotal') }}: <b>{{ money(draftTotal) }} ₸</b>
          <span class="cell-sub">{{ t('billing.vatFromTotal', { rate: vatRate }) }}</span>
        </div>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { DownloadOutlined, PlusOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons-vue'
import * as XLSX from 'xlsx'
import PageHeader from '@/components/PageHeader.vue'
import { billingApi, type BrokerInvoice, type BrokerInvoiceKind } from '@/api/billing'
import { import40Api, type Import40CaseDto } from '@/api/import40'
import { salesApi, type SalesServiceItem } from '@/api/sales'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const authStore = useAuthStore()

const canWrite = computed(
  () => (authStore.role || '').toLowerCase() === 'administrator' || authStore.hasPermission('finance.write'),
)

const loading = ref(false)
const saving = ref(false)
const rows = ref<BrokerInvoice[]>([])
const search = ref('')
const kindFilter = ref<'all' | BrokerInvoiceKind>('all')
const statusFilter = ref<'all' | 'draft' | 'issued' | 'paid'>('all')

const clientOptions = ref<{ value: string; label: string }[]>([])
// Список заявок целиком (с clientId) — форма создания фильтрует его по выбранному клиенту (M13).
const allCases = ref<Import40CaseDto[]>([])
const caseOptions = computed(() =>
  allCases.value
    .filter((c) => !draft.clientId || c.clientId === draft.clientId)
    .map((c) => ({ value: c.id, label: `${c.number} · ${c.cargo}` })),
)
const tariffs = ref<SalesServiceItem[]>([])
const vatRate = ref(16)

const createOpen = ref(false)
const draft = reactive({
  kind: 'invoice' as BrokerInvoiceKind,
  clientId: undefined as string | undefined,
  caseId: undefined as string | undefined,
  dueDate: null as string | null,
  note: '',
  lines: [] as Array<{ name: string; unit: string; quantity: number; unitPrice: number }>,
})

const load = async () => {
  loading.value = true
  try {
    rows.value = await billingApi.list()
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.loadError'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    const [clients, cases, services, org] = await Promise.all([
      import40Api.listClients(),
      import40Api.list(),
      salesApi.listServices(),
      billingApi.organization(),
    ])
    clientOptions.value = clients.map((c) => ({ value: c.id, label: c.username }))
    allCases.value = cases
    tariffs.value = services.filter((s) => s.isActive)
    vatRate.value = org.vatPayer ? org.vatRate : 0
  } catch {
    // справочники не критичны — форму можно заполнить руками
  }
  // Переход из карточки заявки: /billing?caseId=… — открываем форму создания счёта AQNIET
  // сразу с подставленными клиентом и заявкой (M13, задача 2.3), а не просто фильтруем список.
  const caseId = route.query.caseId ? String(route.query.caseId) : ''
  if (caseId) {
    const targetCase = allCases.value.find((c) => c.id === caseId)
    search.value = targetCase?.number ?? ''
    if (canWrite.value) {
      openCreate()
      draft.caseId = caseId
      if (targetCase) draft.clientId = targetCase.clientId
    }
  }
})

const totals = computed(() => ({
  issued: rows.value.filter((r) => r.status === 1 || r.status === 2).reduce((a, r) => a + r.total, 0),
  paid: rows.value.filter((r) => r.status === 2).reduce((a, r) => a + r.total, 0),
  awaiting: rows.value.filter((r) => r.status === 1).reduce((a, r) => a + r.total, 0),
  drafts: rows.value.filter((r) => r.status === 0).length,
}))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (kindFilter.value !== 'all' && r.kind !== kindFilter.value) return false
    if (statusFilter.value === 'draft' && r.status !== 0) return false
    if (statusFilter.value === 'issued' && r.status !== 1) return false
    if (statusFilter.value === 'paid' && r.status !== 2) return false
    if (!q) return true
    return [r.clientName, r.number, r.caseNumber, r.note].join(' ').toLowerCase().includes(q)
  })
})

const kindOptions = computed(() => [
  { label: t('billing.allKinds'), value: 'all' },
  { label: t('billing.invoice'), value: 'invoice' },
  { label: t('billing.act'), value: 'act' },
])
const statusOptions = computed(() => [
  { label: t('billing.allStatuses'), value: 'all' },
  { label: t('billing.draftNo'), value: 'draft' },
  { label: t('billing.issuedStatus'), value: 'issued' },
  { label: t('billing.paidStatus'), value: 'paid' },
])
const kindSelectOptions = computed(() => [
  { value: 'invoice', label: t('billing.invoice') },
  { value: 'act', label: t('billing.act') },
])
const tariffOptions = computed(() => tariffs.value.map((s) => ({ value: s.name, label: `${s.name} — ${money(s.price)} ₸` })))
const filterTariff = (input: string, option: { label: string }) =>
  option.label.toLowerCase().includes(input.toLowerCase())

const columns = computed(() => [
  { title: t('billing.colDoc'), key: 'doc', width: 220 },
  { title: t('billing.colClient'), key: 'client', width: 220 },
  { title: t('billing.colStatus'), key: 'status', width: 140 },
  { title: t('billing.colTotal'), key: 'total', width: 170 },
  { title: t('billing.colDates'), key: 'dates', width: 190 },
  { title: '', key: 'actions', width: 280 },
])

const money = (v: number) => Math.round(v).toLocaleString('ru-RU')
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—')
const statusText = (s: number) =>
  s === 2 ? t('billing.paidStatus') : s === 1 ? t('billing.issuedStatus') : s === 3 ? t('billing.cancelled') : t('billing.draftNo')
const statusColor = (s: number) => (s === 2 ? 'success' : s === 1 ? 'processing' : s === 3 ? 'error' : 'default')

const draftTotal = computed(() => draft.lines.reduce((a, l) => a + (l.quantity || 0) * (l.unitPrice || 0), 0))
const canSubmit = computed(() => !!draft.clientId && draft.lines.some((l) => l.name.trim() && l.unitPrice >= 0))

const openCreate = () => {
  draft.kind = 'invoice'
  draft.clientId = undefined
  draft.dueDate = null
  draft.note = ''
  draft.lines = [{ name: '', unit: '', quantity: 1, unitPrice: 0 }]
  createOpen.value = true
}

const applyTariff = (line: { name: string; unit: string; unitPrice: number }, name: string) => {
  const tariff = tariffs.value.find((s) => s.name === name)
  if (!tariff) return
  line.unit = tariff.unit
  line.unitPrice = tariff.price
}

const submit = async () => {
  if (!canSubmit.value || !draft.clientId) return
  saving.value = true
  try {
    await billingApi.create({
      clientId: draft.clientId,
      caseId: draft.caseId ?? null,
      kind: draft.kind,
      dueDateUtc: draft.dueDate ? `${draft.dueDate}T00:00:00Z` : null,
      note: draft.note || null,
      lines: draft.lines
        .filter((l) => l.name.trim())
        .map((l) => ({ name: l.name.trim(), unit: l.unit, quantity: l.quantity || 1, unitPrice: l.unitPrice || 0 })),
    })
    createOpen.value = false
    message.success(t('billing.created'))
    await load()
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.saveError'))
  } finally {
    saving.value = false
  }
}

const issue = async (r: BrokerInvoice) => {
  try {
    await billingApi.issue(r.id)
    message.success(t('billing.issuedOk'))
    await load()
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.actionError'))
  }
}

const remind = async (r: BrokerInvoice) => {
  try {
    const res = await billingApi.remind(r.id)
    message.success(res.emailSent ? t('billing.remindSent', { to: res.to }) : t('billing.remindNoEmail'))
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.actionError'))
  }
}

const markPaid = async (r: BrokerInvoice) => {
  try {
    await billingApi.markPaid(r.id)
    await load()
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.actionError'))
  }
}

const cancelDoc = async (r: BrokerInvoice) => {
  try {
    await billingApi.cancel(r.id)
    await load()
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.actionError'))
  }
}

const remove = async (r: BrokerInvoice) => {
  try {
    await billingApi.remove(r.id)
    await load()
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.actionError'))
  }
}

const downloadPdf = async (r: BrokerInvoice) => {
  try {
    const blob = await billingApi.pdf(r.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${r.kind === 'act' ? 'Акт' : 'Счёт'}-${r.number || 'черновик'}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай (аудит 1.1).
    if (!e?.response) message.error(t('billing.actionError'))
  }
}

const exportXlsx = () => {
  const data = filtered.value.map((r) => ({
    [t('billing.colDoc')]: r.kind === 'act' ? t('billing.act') : t('billing.invoice'),
    '№': r.number ? `${r.number}/${r.year}` : '',
    [t('billing.colClient')]: r.clientName,
    [t('billing.case')]: r.caseNumber ?? '',
    [t('billing.colStatus')]: statusText(r.status),
    [t('billing.colTotal')]: r.total,
    [t('billing.vat')]: r.vatAmount,
    [t('billing.issuedAtCol')]: r.issuedAtUtc ? fmtDate(r.issuedAtUtc) : '',
    [t('billing.paidAtCol')]: r.paidAtUtc ? fmtDate(r.paidAtUtc) : '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('billing.title'))
  XLSX.writeFile(wb, `billing_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
</script>

<style scoped>
.billing-view { display: flex; flex-direction: column; gap: 18px; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.kpi { background: #fff; border: 1px solid var(--z-line, #e8ecf4); border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi > span { font-size: 11.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--atg-muted, #6b7891); }
.kpi > b { font-family: var(--font-display, 'Manrope', sans-serif); font-size: 22px; font-weight: 800; color: var(--atg-ink, #182640); }
.kpi > small { font-size: 12px; color: var(--atg-muted, #95a1b7); }
.kpi--ok > b { color: #1f9d6a; }
.kpi--warn > b { color: #e07a30; }

.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.cell-main { font-weight: 600; color: var(--atg-ink, #182640); }
.cell-sub { font-size: 12px; color: var(--atg-muted, #95a1b7); }

.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 14px; }
.sub-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--atg-charcoal, #445069); margin: 4px 0 8px; }
.line-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.line-amount { min-width: 110px; text-align: right; font-weight: 600; }
.note-field { margin-top: 14px; }
.draft-total { margin-top: 10px; display: flex; gap: 10px; align-items: baseline; }

@media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } .form-grid { grid-template-columns: 1fr; } }
</style>
