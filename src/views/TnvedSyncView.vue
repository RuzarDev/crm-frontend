<template>
  <div class="tnved-sync-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">ТН ВЭД ЕАЭС — Администрирование</div>
        <h1 class="crm-page-title">Синхронизация данных</h1>
        <p class="crm-page-subtitle">Управление синхронизацией дерева ТН ВЭД с tnved.info.</p>
      </div>
      <div class="crm-page-actions">
        <a-button :loading="explanationsRunning" @click="triggerExplanations">
          <template #icon><FileTextOutlined /></template>
          Загрузить пояснения
        </a-button>
        <a-button :loading="seedRunning" @click="triggerSeed">
          <template #icon><DatabaseOutlined /></template>
          Загрузить переходы
        </a-button>
        <a-button type="primary" :loading="syncRunning" @click="triggerSync" danger>
          <template #icon><SyncOutlined /></template>
          Запустить синхронизацию
        </a-button>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="section-title">История синхронизаций</div>

      <a-spin :spinning="loading">
        <div v-if="!loading && logs.length === 0" class="empty-hint">Синхронизаций ещё не было</div>

        <a-table
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
              <span class="change-stat" title="Добавлено / Обновлено / Удалено">
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
import { ref, h, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DatabaseOutlined, FileTextOutlined, SyncOutlined } from '@ant-design/icons-vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedSyncLogDto } from '@/types/api'

const logs = ref<TnvedSyncLogDto[]>([])
const loading = ref(false)
const syncRunning = ref(false)
const seedRunning = ref(false)
const explanationsRunning = ref(false)

const columns = [
  { title: 'Дата запуска', key: 'startedAtUtc', width: 160 },
  { title: 'Статус', key: 'status', width: 110 },
  { title: 'Длительность', key: 'duration', width: 110 },
  { title: 'Узлы (имп.)', key: 'changes', width: 200 },
  { title: 'Ставок обновлено', dataIndex: 'ratesUpdated', key: 'ratesUpdated', width: 140 },
  { title: 'Инициатор', dataIndex: 'triggeredBy', key: 'triggeredBy', ellipsis: true },
]

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
  if (s === 'Completed') return 'Успешно'
  if (s === 'Running') return 'В процессе'
  if (s === 'Failed') return 'Ошибка'
  return s
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(start: string, finish: string | null) {
  if (!finish) return '—'
  const ms = new Date(finish).getTime() - new Date(start).getTime()
  if (ms < 60000) return `${Math.round(ms / 1000)}с`
  return `${Math.round(ms / 60000)}м`
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
    message.success('Синхронизация запущена')
    await loadHistory()
  } finally {
    syncRunning.value = false
  }
}

async function triggerExplanations() {
  explanationsRunning.value = true
  try {
    const { data } = await tnvedApi.seedExplanations()
    message.success(`Пояснения загружены: ${data.upserted} разделов (ошибок: ${data.failed})`)
  } catch {
    message.error('Ошибка загрузки пояснений')
  } finally {
    explanationsRunning.value = false
  }
}

async function triggerSeed() {
  seedRunning.value = true
  try {
    const { data } = await tnvedApi.seedTransitions()
    message.success(`Переходы загружены: ${data.inserted} записей (${data.sourceVersion})`)
  } catch {
    message.error('Ошибка загрузки переходов')
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
