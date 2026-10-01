<template>
  <div class="tnved-sync-view crm-page">
    <PageHeader
      :kicker="t('sales.tnVedEaesAdministrirovanie')"
      :title="t('sales.sinhronizaciyaDannyh')"
      :subtitle="t('sales.upravlenieSinhronizacieyDerevaTn')"
    >
      <template #actions>
        <a-button :loading="seedRunning" @click="triggerSeed">
          <template #icon><DatabaseOutlined /></template> {{ t('sales.zagruzitPerehody') }} </a-button>
        <a-button type="primary" :loading="syncRunning" @click="triggerSync" danger>
          <template #icon><SyncOutlined /></template> {{ t('sales.zapustitSinhronizaciyu') }} </a-button>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="section-title">{{ t('sales.istoriyaSinhronizaciy') }}</div>

      <a-spin :spinning="loading">
        <div v-if="!loading && logs.length === 0" class="empty-hint">{{ t('sales.sinhronizaciyEscheNeBylo') }}</div>

        <a-table
          class="ref-table"
          v-else
          :data-source="logs"
          :columns="columns"
          :pagination="{ pageSize: 10, showSizeChanger: false }"
          size="small"
          row-key="id"
          :expandable="{ expandedRowRender, rowExpandable: (record: TnvedSyncLogDto) => !!record.errorMessage }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            </template>
            <template v-if="column.key === 'startedAtUtc'">
              <span class="date-cell">{{ fmtDate(record.startedAtUtc) }}</span>
            </template>
            <template v-if="column.key === 'duration'">
              <span class="date-cell">{{ fmtDuration(record.startedAtUtc, record.finishedAtUtc) }}</span>
            </template>
            <template v-if="column.key === 'changes'">
              <span class="change-stat" :title="t('sales.dobavlenoObnovlenoUdaleno')">
                <a-tag color="green" style="font-size:11px">+{{ record.nodesAdded }}</a-tag>
                <a-tag color="blue" style="font-size:11px">~{{ record.nodesUpdated }}</a-tag>
                <a-tag color="red" style="font-size:11px">-{{ record.nodesRemoved }}</a-tag>
              </span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, h, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { DatabaseOutlined, SyncOutlined } from '@ant-design/icons-vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedSyncLogDto } from '@/types/api'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

const logs = ref<TnvedSyncLogDto[]>([])
const loading = ref(false)
const syncRunning = ref(false)
const seedRunning = ref(false)

const columns = computed(() => ([

  { title: t('sales.dataZapuska'), key: 'startedAtUtc', width: 160 },
  { title: t('sales.status'), key: 'status', width: 110 },
  { title: t('sales.dlitelnost'), key: 'duration', width: 110 },
  { title: t('sales.uzlyImp'), key: 'changes', width: 200 },
  { title: t('sales.stavokObnovleno'), dataIndex: 'ratesUpdated', key: 'ratesUpdated', width: 140 },
  { title: t('sales.iniciator'), dataIndex: 'triggeredBy', key: 'triggeredBy', ellipsis: true },
]))
function expandedRowRender(record: TnvedSyncLogDto) {
  return h('div', { style: 'color:#ff4d4f;font-size:12px;padding:4px 0' }, record.errorMessage ?? '')
}

function statusColor(s: string) {
  if (s === 'Completed') return 'success'
  if (s === 'Running') return 'processing'
  if (s === 'Failed') return 'error'
  return 'default'
}

function statusLabel(s: string) {
  if (s === 'Completed') return t('sales.uspeshno')
  if (s === 'Running') return t('sales.vProcesse')
  if (s === 'Failed') return t('sales.oshibka')
  return s
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(start: string, finish: string | null) {
  if (!finish) return '—'
  const ms = new Date(finish).getTime() - new Date(start).getTime()
  if (ms < 60000) return t('sales.sec', { n: Math.round(ms / 1000) })
  return t('sales.min', { n: Math.round(ms / 60000) })
}

async function loadHistory() {
  loading.value = true
  try {
    const { data } = await tnvedApi.syncHistory()
    logs.value = data
  } finally {
    loading.value = false
  }
}

async function triggerSync() {
  syncRunning.value = true
  try {
    await tnvedApi.syncTrigger()
    message.success(t('sales.sinhronizaciyaZapuschena'))
    await loadHistory()
  } finally {
    syncRunning.value = false
  }
}

async function triggerSeed() {
  seedRunning.value = true
  try {
    const { data } = await tnvedApi.seedTransitions()
    message.success(t('sales.perehodyZagruzheny', { n: data.inserted, v: data.sourceVersion }))
  } catch {
    message.error(t('sales.oshibkaZagruzkiPerehodov'))
  } finally {
    seedRunning.value = false
  }
}

onMounted(loadHistory)
</script>

<style scoped>
.section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--atg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}
.date-cell { font-size: 12px; color: var(--atg-muted); }
.change-stat { display: flex; gap: 4px; flex-wrap: wrap; }
.empty-hint {
  color: var(--atg-muted);
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
}
</style>
