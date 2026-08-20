<template>
  <div class="dashboard-view crm-page">
    <PageHeader title="Дашборд" subtitle="Сводная статистика по реестру и клиентскому портфелю.">
      <template #actions>
        <a-button @click="store.fetch" :loading="store.loading">
          <ReloadOutlined />
          Обновить
        </a-button>
      </template>
    </PageHeader>

    <a-spin :spinning="store.loading">
      <div v-if="store.data" class="dashboard-grid">
        <!-- KPI row -->
        <div class="kpi-row">
          <StatTile
            :icon="DatabaseOutlined"
            :value="formatInt(store.data.totalEntries)"
            label="Всего записей"
            tone="teal"
          />
          <StatTile
            :icon="CalendarOutlined"
            :value="formatInt(store.data.entriesThisMonth)"
            label="В этом месяце"
            tone="gold"
          />
          <StatTile
            :icon="InboxOutlined"
            :value="formatDecimal(store.data.totalWeightKg)"
            label="Общий вес (кг)"
            tone="neutral"
          />
          <StatTile
            :icon="DollarOutlined"
            :value="formatDecimal(store.data.totalGrandTotal)"
            label="Итого с НДС"
            tone="success"
          />
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
                <StatusPill :status="item.status" />
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
            <EmptyState
              v-if="!store.data.topClients?.length"
              title="Нет данных по клиентам"
            />
            <a-table
              v-else
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
                  <span class="top-count z-num">{{ record.count }}</span>
                </template>
              </template>
            </a-table>
          </a-card>

          <a-card class="crm-shell-card" :bordered="false" title="Топ ТНВЭД кодов">
            <EmptyState
              v-if="!store.data.topCodes?.length"
              title="Нет данных по кодам ТН ВЭД"
            />
            <a-table
              v-else
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
                  <span class="top-count z-num">{{ record.count }}</span>
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
import PageHeader from '@/components/ui/PageHeader.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const store = useDashboardStore()

onMounted(() => store.fetch())

const formatInt = (n?: number) => String(n ?? 0)
const formatDecimal = (n?: number) => (n ?? 0).toFixed(2)

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
  gap: var(--sp-5);
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-4);
}

/* Status bars */
.status-bars {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.status-bar-row {
  display: grid;
  grid-template-columns: 168px 1fr 48px;
  align-items: center;
  gap: var(--sp-3);
}

.status-bar-label {
  display: flex;
  align-items: center;
}

.status-bar-track {
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--z-line);
  overflow: hidden;
}

.status-bar-fill {
  height: 100%;
  border-radius: var(--r-pill);
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
  gap: var(--sp-4);
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
