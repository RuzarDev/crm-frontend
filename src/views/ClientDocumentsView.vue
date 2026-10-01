<!-- Реестр договоров и доверенностей по ВСЕМ клиентам со сроками действия.
     До этого документы были видны только внутри одного клиента, и никто не отслеживал,
     у кого доверенность заканчивается (аудит 2026-09-23). -->
<template>
  <div class="client-docs-view crm-page">
    <PageHeader
      :kicker="t('clientDocs.kicker')"
      :title="t('clientDocs.title')"
      :subtitle="t('clientDocs.subtitle')"
    >
      <template #actions>
        <a-button :disabled="!filtered.length" @click="exportXlsx"><DownloadOutlined /> Excel</a-button>
        <a-button :loading="loading" @click="load">{{ t('clientDocs.refresh') }}</a-button>
        <span v-if="!loading" class="crm-stat-badge">
          <FileProtectOutlined /> {{ t('clientDocs.total') }}&nbsp;<span class="crm-stat-badge-count">{{ rows.length }}</span>
        </span>
      </template>
    </PageHeader>

    <!-- Договоры, которые клиент подписал, а AQNIET ещё нет: пока их не подписать, клиент не
         может подать заявку. Подписывают администратор и руководитель отдела. -->
    <a-alert
      v-if="aqnietCount && canSignProvider"
      type="info"
      show-icon
      class="expiring-alert"
      :message="t('clientDocs.aqnietTitle', { n: aqnietCount })"
      :description="t('clientDocs.aqnietDesc')"
    >
      <template #action>
        <a-button size="small" type="primary" @click="filter = 'aqniet'">{{ t('clientDocs.showAqniet') }}</a-button>
      </template>
    </a-alert>

    <a-alert
      v-if="expiringCount"
      type="warning"
      show-icon
      class="expiring-alert"
      :message="t('clientDocs.expiringTitle', { n: expiringCount })"
      :description="t('clientDocs.expiringDesc')"
    >
      <template #action>
        <a-button size="small" @click="filter = 'expiring'">{{ t('clientDocs.showExpiring') }}</a-button>
      </template>
    </a-alert>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="filters">
        <a-input v-model:value="search" allow-clear :placeholder="t('clientDocs.searchPh')" style="max-width: 300px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-segmented v-model:value="kind" :options="kindOptions" />
        <a-segmented v-model:value="filter" :options="filterOptions" />
      </div>

      <a-table
        :columns="columns"
        :data-source="filtered"
        :loading="loading"
        row-key="id"
        size="middle"
        :pagination="filtered.length > 25 ? { pageSize: 25, showSizeChanger: false } : false"
        :custom-row="(r: ClientDocumentRow) => ({ onClick: () => router.push(`/clients/${r.clientId}`), style: 'cursor:pointer' })"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'client'">
            <div class="cell-main">{{ record.clientName }}</div>
            <div class="cell-sub">{{ record.clientEmail }}</div>
          </template>
          <template v-else-if="column.key === 'doc'">
            <div class="cell-main">{{ record.kind === 'contract' ? t('clientDocs.contract') : t('clientDocs.poa') }} № {{ record.number }}/{{ record.year }}</div>
            <div class="cell-sub">{{ t('clientDocs.generatedAt', { date: fmtDate(record.generatedAtUtc) }) }}</div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
            <a-tag v-if="record.isSingleUse" color="purple">{{ t('clientDocs.singleUse') }}</a-tag>
          </template>
          <template v-else-if="column.key === 'signs'">
            <a-tag :color="record.clientSigned ? 'success' : 'default'">{{ t('clientDocs.client') }}</a-tag>
            <a-tag v-if="record.kind === 'contract'" :color="record.providerSigned ? 'success' : 'default'">{{ t('clientDocs.broker') }}</a-tag>
            <a-button
              v-if="canSignProvider && needsAqniet(record)"
              size="small"
              type="primary"
              class="sign-btn"
              @click.stop="router.push({ path: '/import-40/company', query: { client: record.clientId, step: 'contract' } })"
            >{{ t('clientDocs.signAqniet') }}</a-button>
          </template>
          <template v-else-if="column.key === 'validity'">
            <template v-if="record.validUntilUtc">
              <a-tag :color="expiryColor(record)">{{ fmtDate(record.validUntilUtc) }}</a-tag>
              <div v-if="record.daysLeft !== null" class="cell-sub">
                {{ record.daysLeft >= 0 ? t('clientDocs.daysLeft', { n: record.daysLeft }) : t('clientDocs.expiredAgo', { n: -record.daysLeft }) }}
              </div>
            </template>
            <span v-else class="muted">{{ t('clientDocs.noLimit') }}</span>
          </template>
        </template>
        <template #emptyText><a-empty :description="t('clientDocs.empty')" /></template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { DownloadOutlined, SearchOutlined, FileProtectOutlined } from '@ant-design/icons-vue'
import { loadXlsx } from '@/utils/xlsx'
import PageHeader from '@/components/PageHeader.vue'
import { clientCardApi, type ClientDocumentRow } from '@/api/clientCard'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)
const rows = ref<ClientDocumentRow[]>([])
const search = ref('')
const kind = ref<'all' | 'contract' | 'poa'>('all')
const filter = ref<'all' | 'active' | 'expiring' | 'awaiting' | 'aqniet'>('all')
const authStore = useAuthStore()
const canSignProvider = computed(() => (authStore.role || '').toLowerCase() === 'administrator' || authStore.hasBusinessRole('rop'))
// Договор: клиент подписал, AQNIET — нет (и договор не отозван/не истёк).
const needsAqniet = (r: ClientDocumentRow) => r.kind === 'contract' && r.status === 1 && r.clientSigned && !r.providerSigned

const kindOptions = computed(() => [
  { label: t('clientDocs.allKinds'), value: 'all' },
  { label: t('clientDocs.contract'), value: 'contract' },
  { label: t('clientDocs.poa'), value: 'poa' },
])

const filterOptions = computed(() => [
  { label: t('clientDocs.all'), value: 'all' },
  { label: t('clientDocs.activeOnly'), value: 'active' },
  { label: t('clientDocs.expiringOnly'), value: 'expiring' },
  { label: t('clientDocs.awaitingOnly'), value: 'awaiting' },
  { label: `${t('clientDocs.aqnietOnly')} (${aqnietCount.value})`, value: 'aqniet' },
])

const load = async () => {
  loading.value = true
  try {
    rows.value = await clientCardApi.documents()
  } catch {
    message.error(t('clientDocs.loadError'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

const expiringCount = computed(() => rows.value.filter((r) => r.expiringSoon).length)
const aqnietCount = computed(() => rows.value.filter(needsAqniet).length)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (kind.value !== 'all' && r.kind !== kind.value) return false
    if (filter.value === 'active' && r.status !== 2) return false
    if (filter.value === 'expiring' && !r.expiringSoon) return false
    if (filter.value === 'awaiting' && r.status !== 1) return false
    if (filter.value === 'aqniet' && !needsAqniet(r)) return false
    if (!q) return true
    return [r.clientName, r.clientEmail, r.number].join(' ').toLowerCase().includes(q)
  })
})

const columns = computed(() => [
  { title: t('clientDocs.colClient'), key: 'client', width: 260 },
  { title: t('clientDocs.colDoc'), key: 'doc', width: 220 },
  { title: t('clientDocs.colStatus'), key: 'status', width: 190 },
  { title: t('clientDocs.colSigns'), key: 'signs', width: 170 },
  { title: t('clientDocs.colValidity'), key: 'validity', width: 170 },
])

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—')
const statusText = (s: number) =>
  s === 2 ? t('clientDocs.active') : s === 1 ? t('clientDocs.awaiting') : s === 3 ? t('clientDocs.expired') : s === 4 ? t('clientDocs.revoked') : t('clientDocs.draft')
const statusColor = (s: number) => (s === 2 ? 'success' : s === 1 ? 'warning' : s === 4 ? 'error' : 'default')
const expiryColor = (r: ClientDocumentRow) =>
  r.daysLeft !== null && r.daysLeft < 0 ? 'error' : r.expiringSoon ? 'warning' : 'default'

const exportXlsx = async () => {
  const XLSX = await loadXlsx()
  const data = filtered.value.map((r) => ({
    [t('clientDocs.colClient')]: r.clientName,
    [t('clientDocs.email')]: r.clientEmail,
    [t('clientDocs.colDoc')]: r.kind === 'contract' ? t('clientDocs.contract') : t('clientDocs.poa'),
    [t('clientDocs.number')]: `${r.number}/${r.year}`,
    [t('clientDocs.colStatus')]: statusText(r.status),
    [t('clientDocs.singleUse')]: r.isSingleUse ? t('clientDocs.yes') : t('clientDocs.no'),
    [t('clientDocs.client')]: r.clientSigned ? t('clientDocs.yes') : t('clientDocs.no'),
    [t('clientDocs.broker')]: r.providerSigned ? t('clientDocs.yes') : t('clientDocs.no'),
    [t('clientDocs.colValidity')]: r.validUntilUtc ? fmtDate(r.validUntilUtc) : '',
    [t('clientDocs.daysLeftCol')]: r.daysLeft ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('clientDocs.title'))
  XLSX.writeFile(wb, `client-documents_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
</script>

<style scoped>
.client-docs-view { display: flex; flex-direction: column; gap: 18px; }
.expiring-alert { border-radius: var(--r-lg); }
.sign-btn { margin-top: 6px; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.cell-main { font-weight: 600; color: var(--z-ink); }
.cell-sub { font-size: 12px; color: var(--z-muted); }
.muted { color: var(--z-muted); }
</style>
