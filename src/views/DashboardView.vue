<template>
  <div class="dashboard-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Zircon CRM</div>
        <h1 class="crm-page-title">Дашборд</h1>
        <p class="crm-page-subtitle">Сводная статистика по реестру и клиентскому портфелю.</p>
      </div>
      <a-button @click="store.fetch" :loading="store.loading">
        <ReloadOutlined />
        Обновить
      </a-button>
    </div>

    <a-spin :spinning="store.loading">
      <div v-if="store.data" class="dashboard-grid">
        <!-- KPI row -->
        <div class="kpi-row">
          <a-card class="kpi-card" :bordered="false">
            <a-statistic
              title="Всего записей"
              :value="store.data.totalEntries"
              :value-style="{ color: 'var(--atg-ink)', fontWeight: 800 }"
            >
              <template #prefix><DatabaseOutlined /></template>
            </a-statistic>
          </a-card>
          <a-card class="kpi-card" :bordered="false">
            <a-statistic
              title="В этом месяце"
              :value="store.data.entriesThisMonth"
              :value-style="{ color: 'var(--atg-teal)', fontWeight: 800 }"
            >
              <template #prefix><CalendarOutlined /></template>
            </a-statistic>
          </a-card>
          <a-card class="kpi-card" :bordered="false">
            <a-statistic
              title="Общий вес (кг)"
              :value="store.data.totalWeightKg"
              :precision="2"
              :value-style="{ color: 'var(--atg-ink)', fontWeight: 800 }"
            >
              <template #prefix><InboxOutlined /></template>
            </a-statistic>
          </a-card>
          <a-card class="kpi-card" :bordered="false">
            <a-statistic
              title="Итого с НДС"
              :value="store.data.totalGrandTotal"
              :precision="2"
              :value-style="{ color: 'var(--atg-green)', fontWeight: 800 }"
            >
              <template #prefix><DollarOutlined /></template>
            </a-statistic>
          </a-card>
        </div>

        <!-- Status breakdown -->
        <a-card class="crm-shell-card status-card" :bordered="false" title="По статусам">
          <div class="status-bars">
            <div
              v-for="item in store.data.byStatus"
              :key="item.status"
              class="status-bar-row"
            >
              <div class="status-bar-label">
                <span class="status-dot" :style="{ background: statusColor(item.status) }" />
                {{ formatStatus(item.status) }}
              </div>
              <div class="status-bar-track">
                <div
                  class="status-bar-fill"
                  :style="{
                    width: barWidth(item.count) + '%',
                    background: statusColor(item.status),
                  }"
                />
              </div>
              <span class="status-bar-count">{{ item.count }}</span>
            </div>
          </div>
        </a-card>

        <!-- Top clients + top codes -->
        <div class="bottom-row">
          <a-card class="crm-shell-card" :bordered="false" title="Топ клиентов">
            <a-table
              :data-source="store.data.topClients"
              :columns="clientColumns"
              :pagination="false"
              size="small"
              row-key="clientId"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span class="top-name">{{ record.displayName || record.username }}</span>
                  <span v-if="record.displayName" class="top-sub">@{{ record.username }}</span>
                </template>
                <template v-else-if="column.key === 'count'">
                  <span class="top-count">{{ record.count }}</span>
                </template>
              </template>
            </a-table>
          </a-card>

          <a-card class="crm-shell-card" :bordered="false" title="Топ ТНВЭД кодов">
            <a-table
              :data-source="store.data.topCodes"
              :columns="codeColumns"
              :pagination="false"
              size="small"
              row-key="code"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'code'">
                  <span class="top-code">{{ record.code }}</span>
                  <span v-if="record.treeName" class="top-sub">{{ record.treeName }}</span>
                </template>
                <template v-else-if="column.key === 'count'">
                  <span class="top-count">{{ record.count }}</span>
                </template>
              </template>
            </a-table>
          </a-card>
        </div>
      </div>

      <div v-else-if="!store.loading" class="empty-state">
        <a-empty description="Нет данных" />
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import {
  CalendarOutlined,
  DatabaseOutlined,
  DollarOutlined,
  InboxOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'

const store = useDashboardStore()

onMounted(() => store.fetch())

const STATUS_LABELS: Record<string, string> = {
  InProgress: 'В работе',
  Submitted: 'Подано',
  Released: 'Выпущено',
  ConditionallyReleased: 'Условно выпущено',
  Problematic: 'Проблемный',
  Rejected: 'Отказано',
  Withdrawn: 'Отозвано',
  Archived: 'Архив',
}

const STATUS_COLORS: Record<string, string> = {
  InProgress: '#2BBCD4',
  Submitted: '#1B2A4A',
  Released: '#286b4b',
  ConditionallyReleased: '#C9A84C',
  Problematic: '#e07a30',
  Rejected: '#b84a3c',
  Withdrawn: '#8C8C8C',
  Archived: '#c4cad9',
}

const formatStatus = (s: string) => STATUS_LABELS[s] ?? s
const statusColor = (s: string) => STATUS_COLORS[s] ?? '#8C8C8C'

const maxCount = () =>
  Math.max(...(store.data?.byStatus.map((x) => x.count) ?? [1]), 1)

const barWidth = (count: number) => Math.round((count / maxCount()) * 100)

const clientColumns = [
  { title: 'Клиент', key: 'name', ellipsis: true },
  { title: 'Деклараций', key: 'count', width: 110, align: 'right' as const },
]

const codeColumns = [
  { title: 'Код', key: 'code', ellipsis: true },
  { title: 'Деклараций', key: 'count', width: 110, align: 'right' as const },
]
</script>

<style scoped>
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kpi-card {
  border: 1px solid var(--atg-line);
  border-top: 3px solid var(--atg-teal);
  border-radius: var(--atg-radius-lg);
  box-shadow: var(--atg-shadow);
}

.kpi-card :deep(.ant-statistic-title) {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atg-muted);
  margin-bottom: 8px;
}

.kpi-card :deep(.ant-statistic-content) {
  font-size: 28px;
}

/* Status bars */
.status-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-bar-row {
  display: grid;
  grid-template-columns: 160px 1fr 48px;
  align-items: center;
  gap: 12px;
}

.status-bar-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--atg-charcoal);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-bar-track {
  height: 8px;
  border-radius: 999px;
  background: var(--atg-line);
  overflow: hidden;
}

.status-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s var(--atg-ease);
}

.status-bar-count {
  font-size: 13px;
  font-weight: 750;
  color: var(--atg-ink);
  text-align: right;
}

/* Bottom row */
.bottom-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.top-name {
  display: block;
  font-weight: 650;
  color: var(--atg-ink);
  font-size: 13px;
}

.top-code {
  display: block;
  font-weight: 700;
  color: var(--atg-teal-dark);
  font-family: monospace;
  font-size: 13px;
  letter-spacing: 0.04em;
}

.top-sub {
  display: block;
  font-size: 11.5px;
  color: var(--atg-muted);
  margin-top: 1px;
}

.top-count {
  font-size: 14px;
  font-weight: 750;
  color: var(--atg-ink);
}

.empty-state {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

@media (max-width: 900px) {
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .bottom-row {
    grid-template-columns: 1fr;
  }

  .status-bar-row {
    grid-template-columns: 130px 1fr 40px;
  }
}

@media (max-width: 480px) {
  .kpi-row {
    grid-template-columns: 1fr;
  }
}
</style>
