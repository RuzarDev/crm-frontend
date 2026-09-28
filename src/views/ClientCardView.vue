<!-- Карточка клиента «360»: реквизиты, документы, заявки и деньги на одном экране.
     Раньше всё это лежало на четырёх разных экранах (аудит 2026-09-23). -->
<template>
  <div class="client-card-view crm-page">
    <PageHeader
      :kicker="t('clientCard.kicker')"
      :title="card?.companyName || card?.username || '—'"
      :subtitle="subtitle"
    >
      <template #actions>
        <a-button @click="router.push('/clients')"><ArrowLeftOutlined /> {{ t('clientCard.toList') }}</a-button>
        <a-button :loading="loading" @click="load">{{ t('clientCard.refresh') }}</a-button>
      </template>
    </PageHeader>

    <a-spin :spinning="loading">
      <template v-if="card">
        <div class="kpi-row">
          <div class="kpi"><span>{{ t('clientCard.casesTotal') }}</span><b>{{ card.totals.casesTotal }}</b>
            <small>{{ t('clientCard.casesActive', { n: card.totals.casesActive }) }}</small></div>
          <div class="kpi"><span>{{ t('clientCard.declarations') }}</span><b>{{ card.totals.declarationsTotal }}</b>
            <small>{{ t('clientCard.casesDone', { n: card.totals.casesDone }) }}</small></div>
          <div class="kpi kpi--warn"><span>{{ t('clientCard.invoiced') }}</span><b>{{ money(card.totals.invoicedTotal) }} ₸</b>
            <small>{{ t('clientCard.svhInvoices') }}</small></div>
          <div class="kpi kpi--ok"><span>{{ t('clientCard.paid') }}</span><b>{{ money(card.totals.paidTotal) }} ₸</b>
            <small>{{ t('clientCard.confirmed') }}</small></div>
        </div>

        <a-card class="crm-shell-card" :bordered="false">
          <a-tabs v-model:activeKey="tab">
            <!-- ① Реквизиты -->
            <a-tab-pane key="profile" :tab="t('clientCard.tabProfile')">
              <div class="props-grid">
                <div class="prop"><span>{{ t('clientCard.company') }}</span><b>{{ card.profile.companyName || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.bin') }}</span><b>{{ card.profile.bin || card.bin || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.director') }}</span><b>{{ card.profile.directorName || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.basis') }}</span><b>{{ card.profile.directorBasis || '—' }}</b></div>
                <div class="prop full"><span>{{ t('clientCard.legalAddress') }}</span><b>{{ card.profile.legalAddress || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.bank') }}</span><b>{{ card.profile.bank || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.iik') }}</span><b>{{ card.profile.iik || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.bik') }}</span><b>{{ card.profile.bik || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.kbe') }}</span><b>{{ card.profile.kbe || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.login') }}</span><b>{{ card.username }}</b></div>
                <div class="prop"><span>{{ t('clientCard.email') }}</span><b>{{ card.email || card.profile.email || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.phone') }}</span><b>{{ card.phone || card.profile.phone || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.contactPerson') }}</span><b>{{ card.profile.contactPersonName || '—' }}</b></div>
                <div class="prop"><span>{{ t('clientCard.contactPhone') }}</span><b>{{ card.profile.contactPhone || '—' }}</b></div>
              </div>
              <div class="profile-foot">
                <a-tag :color="card.profile.isComplete ? 'success' : 'warning'">
                  {{ card.profile.isComplete ? t('clientCard.profileComplete') : t('clientCard.profileIncomplete') }}
                </a-tag>
                <a-button type="link" @click="router.push('/import-40/company')">{{ t('clientCard.editProfile') }}</a-button>
              </div>
            </a-tab-pane>

            <!-- ② Документы -->
            <a-tab-pane key="docs" :tab="`${t('clientCard.tabDocs')} (${card.documents.length})`">
              <a-empty v-if="!card.documents.length" :description="t('clientCard.noDocs')" />
              <a-table
                v-else
                :columns="docColumns"
                :data-source="card.documents"
                row-key="id"
                size="middle"
                :pagination="false"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'doc'">
                    <div class="cell-main">{{ record.kind === 'contract' ? t('clientCard.contract') : t('clientCard.poa') }} № {{ record.number }}/{{ record.year }}</div>
                    <div class="cell-sub">{{ t('clientCard.generatedAt', { date: fmtDate(record.generatedAtUtc) }) }}</div>
                  </template>
                  <template v-else-if="column.key === 'status'">
                    <a-tag :color="docStatusColor(record.status)">{{ docStatusLabel(record.status) }}</a-tag>
                    <a-tag v-if="record.isSingleUse" color="purple">{{ t('clientCard.singleUse') }}</a-tag>
                  </template>
                  <template v-else-if="column.key === 'validity'">
                    <template v-if="record.validUntilUtc">
                      <a-tag :color="expiryColor(record)">{{ fmtDate(record.validUntilUtc) }}</a-tag>
                      <div v-if="record.daysLeft !== null" class="cell-sub">
                        {{ record.daysLeft >= 0 ? t('clientCard.daysLeft', { n: record.daysLeft }) : t('clientCard.expiredAgo', { n: -record.daysLeft }) }}
                      </div>
                    </template>
                    <span v-else class="muted">{{ t('clientCard.noLimit') }}</span>
                  </template>
                  <template v-else-if="column.key === 'signs'">
                    <div><a-tag :color="record.clientSigned ? 'success' : 'default'">{{ t('clientCard.clientSign') }}</a-tag>
                      <span class="cell-sub">{{ record.clientSigned ? signMethod(record.clientSignMethod) : '—' }}</span></div>
                    <div v-if="record.kind === 'contract'"><a-tag :color="record.providerSigned ? 'success' : 'default'">{{ t('clientCard.brokerSign') }}</a-tag>
                      <span class="cell-sub">{{ record.providerSigned ? signMethod(record.providerSignMethod) : '—' }}</span></div>
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <a-space>
                      <!-- Договор подписан клиентом, ждёт AQNIET: сразу на страницу подписи этого клиента. -->
                      <a-button
                        v-if="canSignProvider && record.kind === 'contract' && record.status === 1 && record.clientSigned && !record.providerSigned"
                        size="small"
                        type="primary"
                        @click="router.push({ path: '/import-40/company', query: { client: clientId, step: 'contract' } })"
                      >{{ t('clientDocs.signAqniet') }}</a-button>
                      <a-button size="small" @click="downloadBlank(record)"><DownloadOutlined /> {{ t('clientCard.download') }}</a-button>
                      <span v-if="record.filesCount" class="cell-sub">{{ t('clientCard.signedFiles', { n: record.filesCount }) }}</span>
                    </a-space>
                  </template>
                </template>
              </a-table>
            </a-tab-pane>

            <!-- ③ Заявки -->
            <a-tab-pane key="cases" :tab="`${t('clientCard.tabCases')} (${card.cases.length})`">
              <a-empty v-if="!card.cases.length" :description="t('clientCard.noCases')" />
              <a-table
                v-else
                :columns="caseColumns"
                :data-source="card.cases"
                row-key="id"
                size="middle"
                :pagination="card.cases.length > 20 ? { pageSize: 20, showSizeChanger: false } : false"
                :custom-row="(r: ClientCardCase) => ({ onClick: () => router.push(`/import-40/${r.id}`), style: 'cursor:pointer' })"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'case'">
                    <div class="cell-main"><span class="case-number">{{ record.number }}</span> {{ record.cargo }}</div>
                    <div class="cell-sub">{{ record.post || '—' }}</div>
                  </template>
                  <template v-else-if="column.key === 'status'">
                    <a-tag :color="record.isProblem ? 'error' : 'default'">{{ statusLabel(record.status) }}</a-tag>
                  </template>
                  <template v-else-if="column.key === 'dt'">{{ record.declarationsCount || '—' }}</template>
                  <template v-else-if="column.key === 'money'">
                    <span v-if="record.svhInvoiceAmount != null">{{ money(record.svhInvoiceAmount) }} ₸</span>
                    <span v-else class="muted">—</span>
                    <a-tag v-if="record.paymentConfirmed" color="success">{{ t('clientCard.paidTag') }}</a-tag>
                  </template>
                  <template v-else-if="column.key === 'created'">{{ fmtDate(record.createdAtUtc) }}</template>
                </template>
              </a-table>
            </a-tab-pane>
          </a-tabs>
        </a-card>
      </template>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { clientCardApi, type ClientCard, type ClientCardCase, type ClientCardDoc } from '@/api/clientCard'
import { import40ContractApi } from '@/api/import40Contract'
import { useImport40Status } from '@/composables/useImport40Status'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { statusLabel } = useImport40Status()
const authStore = useAuthStore()
// Подпись со стороны AQNIET — администратор или руководитель отдела (как на сервере).
const canSignProvider = computed(() => (authStore.role || '').toLowerCase() === 'administrator' || authStore.hasBusinessRole('rop'))

const clientId = String(route.params.id ?? '')
const loading = ref(false)
const card = ref<ClientCard | null>(null)
const tab = ref<'profile' | 'docs' | 'cases'>('profile')

const subtitle = computed(() => {
  if (!card.value) return ''
  return [card.value.email || card.value.username, card.value.bin ? `${t('clientCard.bin')} ${card.value.bin}` : null]
    .filter(Boolean)
    .join(' · ')
})

const load = async () => {
  loading.value = true
  try {
    card.value = await clientCardApi.card(clientId)
  } catch {
    message.error(t('clientCard.loadError'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

const docColumns = computed(() => [
  { title: t('clientCard.colDoc'), key: 'doc', width: 240 },
  { title: t('clientCard.colStatus'), key: 'status', width: 190 },
  { title: t('clientCard.colValidity'), key: 'validity', width: 170 },
  { title: t('clientCard.colSigns'), key: 'signs', width: 260 },
  { title: '', key: 'actions', width: 200 },
])

const caseColumns = computed(() => [
  { title: t('clientCard.colCase'), key: 'case' },
  { title: t('clientCard.colStatus'), key: 'status', width: 190 },
  { title: t('clientCard.colDt'), key: 'dt', width: 80 },
  { title: t('clientCard.colMoney'), key: 'money', width: 180 },
  { title: t('clientCard.colCreated'), key: 'created', width: 110 },
])

const money = (v: number) => Math.round(v).toLocaleString('ru-RU')
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—')

const docStatusLabel = (s: number) =>
  s === 2 ? t('clientCard.active') : s === 1 ? t('clientCard.awaiting') : s === 3 ? t('clientCard.expired') : s === 4 ? t('clientCard.revoked') : t('clientCard.draft')
const docStatusColor = (s: number) => (s === 2 ? 'success' : s === 1 ? 'warning' : s === 4 ? 'error' : 'default')
const signMethod = (m: string | null) =>
  m === 'egov' ? t('clientCard.egov') : m === 'upload' ? t('clientCard.uploaded') : t('clientCard.systemMark')

// Красный — уже истёк, оранжевый — истекает в ближайший месяц.
const expiryColor = (d: ClientCardDoc) =>
  d.daysLeft !== null && d.daysLeft < 0 ? 'error' : d.expiringSoon ? 'warning' : 'default'

const downloadBlank = async (doc: ClientCardDoc) => {
  try {
    const blob = await import40ContractApi.downloadDocument(clientId, doc.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.kind === 'contract' ? 'Договор' : 'Доверенность'}-${doc.number}-${doc.year}.docx`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    message.error(t('clientCard.downloadError'))
  }
}
</script>

<style scoped>
.client-card-view { display: flex; flex-direction: column; gap: 18px; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.kpi { background: #fff; border: 1px solid var(--z-line, #e8ecf4); border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.kpi > span { font-size: 11.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--atg-muted, #6b7891); }
.kpi > b { font-family: var(--font-display, 'Manrope', sans-serif); font-size: 24px; font-weight: 800; color: var(--atg-ink, #182640); }
.kpi > small { font-size: 12px; color: var(--atg-muted, #95a1b7); }
.kpi--warn > b { color: #e07a30; }
.kpi--ok > b { color: #1f9d6a; }

.props-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.prop { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.prop.full { grid-column: 1 / -1; }
.prop > span { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--atg-muted, #95a1b7); }
.prop > b { font-weight: 600; color: var(--atg-ink, #182640); overflow-wrap: anywhere; }
.profile-foot { display: flex; align-items: center; gap: 10px; margin-top: 18px; }

.cell-main { font-weight: 600; color: var(--atg-ink, #182640); }
.cell-sub { font-size: 12px; color: var(--atg-muted, #95a1b7); }
.case-number { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; color: var(--atg-teal, #22b8d0); margin-right: 4px; }
.muted { color: var(--atg-muted, #95a1b7); }

@media (max-width: 1100px) { .props-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } .props-grid { grid-template-columns: 1fr; } }
</style>
