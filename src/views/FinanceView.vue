<template>
  <div class="finance-view crm-page">
    <PageHeader :kicker="t('admin.buhgalteriya')" :title="t('admin.finansy')" :subtitle="t('admin.schetaSvhOplatyKlientov')">
      <template #actions>
        <a-range-picker v-model:value="period" format="DD.MM.YYYY" value-format="YYYY-MM-DD" allow-clear @change="load" />
        <a-button :disabled="!data?.rows.length" @click="exportXlsx"><DownloadOutlined /> Excel</a-button>
        <a-button :loading="loading" @click="load">{{ t('admin.obnovit') }}</a-button>
      </template>
    </PageHeader>

    <a-spin :spinning="loading">
      <template v-if="data">
        <div class="kpi-row">
          <div class="kpi"><span>{{ t('admin.schetovVystavleno') }}</span><b>{{ data.invoicedCount }}</b><small>{{ money(data.svhInvoicedTotal) }} ₸</small></div>
          <div class="kpi kpi--warn"><span>{{ t('admin.zhdutOplaty') }}</span><b>{{ data.awaitingPaymentCount }}</b><small>{{ t('admin.schetVystavlenOplataNe') }}</small></div>
          <div class="kpi kpi--ok"><span>{{ t('admin.oplacheno') }}</span><b>{{ data.paidCount }}</b><small>{{ money(data.svhPaidTotal) }} ₸</small></div>
          <div class="kpi kpi--navy"><span>{{ t('admin.tamozhennyePlatezhiGrv') }}</span><b>{{ money(data.customsPaymentsTotal) }} ₸</b><small>{{ t('admin.poVsemDtVybrannyh') }}</small></div>
        </div>

        <!-- Аудит §4.4: у бухгалтера отдельно — заявки, где СВХ уже оплачен и осталось выставить
             или получить оплату счёта AQNIET (шаг 6, Import40Status.Paid=7). Ссылка ведёт в
             «Счета» с подставленным caseId (та же логика, что и кнопка «Выставить счёт» в карточке). -->
        <a-card
          v-if="awaitingAqniet.length"
          class="crm-shell-card"
          :bordered="false"
          style="margin-bottom: 16px"
        >
          <template #title>{{ t('admin.zhdutOplatyUslugAqniet') }} ({{ awaitingAqniet.length }})</template>
          <a-list :data-source="awaitingAqniet" size="small">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta>
                  <template #title>
                    <a @click="router.push(`/billing?caseId=${item.caseId}`)">{{ item.number }} · {{ item.clientName }}</a>
                  </template>
                  <template #description>{{ item.cargo }}</template>
                </a-list-item-meta>
              </a-list-item>
            </template>
          </a-list>
        </a-card>

        <a-card class="crm-shell-card" :bordered="false">
          <ZFilterBar class="filters">
            <a-input v-model:value="search" allow-clear :placeholder="t('admin.poiskPoKlientuGruzu')" style="max-width: 300px"><template #prefix><SearchOutlined /></template></a-input>
            <a-segmented v-model:value="filter" :options="filterOptions" />
          </ZFilterBar>
          <ZTable :columns="columns" :data-source="filtered" row-key="caseId" size="middle" :pagination="{ pageSize: 20, showSizeChanger: false }" :scroll="{ x: 1100 }"
            :custom-row="(r: FinanceRow) => (authStore.isFinanceOnly
              ? {}
              : { onClick: () => router.push(`/import-40/${r.caseId}`), style: 'cursor:pointer' })">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'case'">
                <div class="cell-main"><span class="case-number">{{ record.number }}</span> {{ record.clientName }}</div>
                <div class="cell-sub">{{ record.cargo }}</div>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="record.isProblem ? 'error' : statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
              </template>
              <template v-else-if="column.key === 'invoice'">
                <template v-if="record.invoicedAtUtc || record.svhInvoiceNote">
                  <div class="cell-main">{{ record.svhInvoiceAmount != null ? money(record.svhInvoiceAmount) + ' ₸' : (record.svhInvoiceNote || '—') }}<span v-if="record.svhInvoiceNumber" class="cell-sub"> · № {{ record.svhInvoiceNumber }}</span></div>
                  <div class="cell-sub">{{ record.invoicedAtUtc ? fmtDate(record.invoicedAtUtc) : '' }}<span v-if="record.svhInvoiceAmount != null && record.svhInvoiceNote"> · {{ record.svhInvoiceNote }}</span></div>
                </template>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="column.key === 'payment'">
                <a-tag v-if="record.paymentConfirmed" color="success">{{ t('admin.oplachenoDate', { date: record.paidAtUtc ? fmtDate(record.paidAtUtc) : '' }) }}</a-tag>
                <a-tag v-else-if="record.hasPaymentCheck" color="processing">{{ t('admin.chekNaProverke') }}</a-tag>
                <a-tag v-else-if="record.status === 6" color="warning">{{ t('admin.zhdetOplaty') }}</a-tag>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="column.key === 'customs'">
                <span class="tnum">{{ record.customsPaymentsKzt ? money(record.customsPaymentsKzt) + ' ₸' : '—' }}</span>
                <div class="cell-sub" v-if="record.declarationsCount">{{ t('admin.dtCount', { n: record.declarationsCount }) }}</div>
              </template>
              <template v-else-if="column.key === 'files'">
                <a-space wrap size="small">
                  <a-button v-for="f in record.files" :key="f.id" size="small" type="link" @click.stop="download(record.caseId, f)">
                    <PaperClipOutlined /> {{ f.section === 'svh-invoice' ? t('admin.schet') : t('admin.chek') }}
                  </a-button>
                  <span v-if="!record.files.length" class="muted">—</span>
                </a-space>
              </template>
              <template v-else-if="column.key === 'created'">{{ fmtDate(record.createdAtUtc) }}</template>
            </template>
            <template #emptyText><a-empty :description="t('admin.zayavokZaPeriodNet')" /></template>
          </ZTable>
        </a-card>
      </template>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from '@/ui/message'
import { DownloadOutlined, SearchOutlined, PaperClipOutlined } from '@ant-design/icons-vue'
import { loadXlsx } from '@/utils/xlsx'
import PageHeader from '@/components/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { financeApi, type FinanceOverview, type FinanceRow, type FinanceFile } from '@/api/manage'
import { import40Api } from '@/api/import40'
import { useImport40Status } from '@/composables/useImport40Status'

const { t } = useI18n()

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const data = ref<FinanceOverview | null>(null)
const period = ref<[string, string] | null>(null)
const search = ref('')
const filter = ref<'all' | 'awaiting' | 'paid' | 'invoiced'>('all')
// Аудит §4.4: Import40Status.Paid = 7 — СВХ оплачен, заявка ждёт счёта/оплаты AQNIET.
const awaitingAqniet = computed(() => (data.value?.rows ?? []).filter((r) => r.status === 7))
const filterOptions = computed(() => ([

  { label: t('admin.vse'), value: 'all' },
  { label: t('admin.zhdutOplaty'), value: 'awaiting' },
  { label: t('admin.oplacheno'), value: 'paid' },
  { label: t('admin.schetVystavlen'), value: 'invoiced' },
]))
const load = async () => {
  loading.value = true
  try {
    data.value = await financeApi.overview(period.value?.[0], period.value?.[1])
  } catch {
    message.error(t('admin.neUdalosZagruzitFinansy'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (data.value?.rows ?? []).filter((r) => {
    if (filter.value === 'awaiting' && !(r.status === 6 && !r.paymentConfirmed)) return false
    if (filter.value === 'paid' && !r.paymentConfirmed) return false
    if (filter.value === 'invoiced' && !(r.invoicedAtUtc || r.status >= 6)) return false
    return !q || [r.number, r.clientName, r.cargo].join(' ').toLowerCase().includes(q)
  })
})

const columns = computed(() => ([

  { title: t('admin.zayavka'), key: 'case', width: 260 },
  { title: t('admin.status'), key: 'status', width: 170 },
  { title: t('admin.schetSvh'), key: 'invoice', width: 200 },
  { title: t('admin.oplata'), key: 'payment', width: 170 },
  { title: t('admin.tamozhPlatezhi'), key: 'customs', width: 150 },
  { title: t('admin.fayly'), key: 'files', width: 160 },
  { title: t('admin.sozdana'), key: 'created', width: 100 },
]))
const money = (v: number) => Math.round(v).toLocaleString('ru-RU')
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU')
const { statusLabel } = useImport40Status()
const statusColor = (s: number) => (s >= 8 ? 'success' : s === 6 ? 'warning' : 'processing')

const download = async (caseId: string, f: FinanceFile) => {
  try {
    const blob = await import40Api.downloadFile(caseId, f.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = f.fileName; a.click(); URL.revokeObjectURL(url)
  } catch { message.error(t('admin.neUdalosSkachatFayl')) }
}

const exportXlsx = async () => {
  const XLSX = await loadXlsx()
  const rows = filtered.value.map((r) => ({
    [t('admin.nomer')]: r.number, [t('admin.klient')]: r.clientName, [t('admin.gruz')]: r.cargo, [t('admin.status')]: statusLabel(r.status),
    [t('admin.schetSvh2')]: r.svhInvoiceAmount ?? '', [t('admin.scheta')]: r.svhInvoiceNumber, [t('admin.zametkaPoSchetu')]: r.svhInvoiceNote,
    [t('admin.schetVystavlen')]: r.invoicedAtUtc ? fmtDate(r.invoicedAtUtc) : '',
    [t('admin.oplata')]: r.paymentConfirmed ? t('admin.oplacheno2') : r.hasPaymentCheck ? t('admin.chekNaProverke') : r.status === 6 ? t('admin.zhdetOplaty') : '',
    [t('admin.oplacheno')]: r.paidAtUtc ? fmtDate(r.paidAtUtc) : '',
    [t('admin.tamozhPlatezhiGrv')]: r.customsPaymentsKzt, [t('admin.dt')]: r.declarationsCount, [t('admin.sozdana')]: fmtDate(r.createdAtUtc),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t('admin.finansy'))
  XLSX.writeFile(wb, `finance_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
</script>

<style scoped>
.finance-view { display: flex; flex-direction: column; gap: 18px; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.kpi { background: #fff; border: 1px solid var(--z-line, #e8ecf4); border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi > span { font-size: 12px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--z-muted); }
.kpi > b { font-family: var(--font-display, 'Manrope', sans-serif); font-size: 26px; font-weight: 800; color: var(--z-ink); }
.kpi > small { font-size: 12px; color: var(--z-muted); }
.kpi--warn > b { color: #e07a30; } .kpi--ok > b { color: #1f9d6a; } .kpi--navy > b { color: #3b6fd6; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.cell-main { font-weight: 600; color: var(--z-ink); }
.case-number { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; color: var(--z-teal); margin-right: 4px; }
.cell-sub { font-size: 12px; color: var(--z-muted); }
.muted { color: var(--z-muted); }
@media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
</style>
