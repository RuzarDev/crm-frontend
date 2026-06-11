<template>
  <div class="analytics-view crm-page">
    <!-- Page Header -->
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Операционные метрики</div>
        <h1 class="crm-page-title">Панель аналитики</h1>
        <p class="crm-page-subtitle">
          Общие показатели эффективности: обработка составов, статистика декларирования и скорость работы брокеров.
        </p>
      </div>
      <div class="crm-page-actions">
        <a-button type="primary" @click="refreshData" :loading="loading">
          <ReloadOutlined />
          Обновить данные
        </a-button>
      </div>
    </div>

    <!-- KPI Widgets Grid -->
    <div class="kpi-grid">
      <div class="kpi-card teal-gradient-bg">
        <div class="kpi-icon-wrap"><BuildOutlined /></div>
        <div class="kpi-content">
          <span>Составов в работе</span>
          <strong>{{ kpis.activeTrains }}</strong>
          <small>+2 за сегодня</small>
        </div>
      </div>

      <div class="kpi-card gold-gradient-bg">
        <div class="kpi-icon-wrap"><GoldOutlined /></div>
        <div class="kpi-content">
          <span>Обработано контейнеров</span>
          <strong>{{ kpis.processedContainers }}</strong>
          <small>98% вовремя</small>
        </div>
      </div>

      <div class="kpi-card navy-gradient-bg">
        <div class="kpi-icon-wrap"><FileDoneOutlined /></div>
        <div class="kpi-content">
          <span>Сгенерировано деклараций</span>
          <strong>{{ kpis.totalDeclarations }}</strong>
          <small>+12 за эту неделю</small>
        </div>
      </div>

      <div class="kpi-card accent-soft-bg">
        <div class="kpi-icon-wrap"><HourglassOutlined /></div>
        <div class="kpi-content">
          <span>Ср. время разбора</span>
          <strong>{{ kpis.avgProcessingTime }}</strong>
          <small>Быстрее на 4 мин</small>
        </div>
      </div>
    </div>

    <!-- Charts & Metrics Workspace -->
    <div class="analytics-workspace">
      <!-- Left side: Bar chart -->
      <a-card class="crm-shell-card chart-card" :bordered="false">
        <template #title>
          <span class="card-title">
            <BarChartOutlined />
            Контейнеров по клиентам (Топ-5)
          </span>
        </template>
        <div class="chart-container">
          <div v-for="client in clientVolume" :key="client.name" class="bar-row">
            <div class="bar-label">{{ client.name }}</div>
            <div class="bar-wrapper">
              <div
                class="bar-fill"
                :style="{ width: `${client.percentage}%` }"
              ></div>
            </div>
            <div class="bar-value">{{ client.count }} шт.</div>
          </div>
        </div>
      </a-card>

      <!-- Right side: Funnel status -->
      <a-card class="crm-shell-card funnel-card" :bordered="false">
        <template #title>
          <span class="card-title">
            <PieChartOutlined />
            Воронка пакетов документов
          </span>
        </template>
        <div class="funnel-container">
          <div v-for="step in funnelSteps" :key="step.label" class="funnel-step">
            <div class="funnel-step-header">
              <span>{{ step.label }}</span>
              <strong>{{ step.count }}</strong>
            </div>
            <a-progress
              :percent="step.percentage"
              :stroke-color="step.color"
              :show-info="false"
              stroke-width="8"
            />
          </div>
        </div>
      </a-card>
    </div>

    <!-- Recent Activity Table -->
    <a-card class="crm-shell-card" :bordered="false">
      <template #title>
        <span class="card-title">
          <HistoryOutlined />
          Последние операции брокеров
        </span>
      </template>
      <a-table
        :columns="columns"
        :data-source="activities"
        :pagination="false"
        row-key="id"
        size="middle"
        class="activity-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'broker'">
            <div class="broker-cell">
              <div class="broker-avatar">{{ record.broker.charAt(0).toUpperCase() }}</div>
              <strong>{{ record.broker }}</strong>
            </div>
          </template>
          <template v-else-if="column.key === 'action'">
            <span class="action-desc">{{ record.action }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag color="green">Выполнено</a-tag>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  BuildOutlined,
  GoldOutlined,
  FileDoneOutlined,
  HourglassOutlined,
  ReloadOutlined,
  BarChartOutlined,
  PieChartOutlined,
  HistoryOutlined,
} from '@ant-design/icons-vue'

const loading = ref(false)

const kpis = ref({
  activeTrains: 8,
  processedContainers: 142,
  totalDeclarations: 389,
  avgProcessingTime: '18 мин',
})

const clientVolume = ref([
  { name: 'ТОО «Aqniet Import»', count: 48, percentage: 100 },
  { name: 'АО «Азия Логистикс»', count: 32, percentage: 67 },
  { name: 'ТОО «Казахстан Курьер»', count: 24, percentage: 50 },
  { name: 'ИП Муратов и К', count: 18, percentage: 38 },
  { name: 'ТОО «Customs Service»', count: 12, percentage: 25 },
])

const funnelSteps = ref([
  { label: 'Загружено экспедиторами', count: 28, percentage: 100, color: '#2BBCD4' },
  { label: 'Принято брокерами к разбору', count: 19, percentage: 68, color: '#C9A84C' },
  { label: 'Успешно обработано и занесено в реестр', count: 14, percentage: 50, color: '#10b981' },
])

const columns = [
  { title: 'Брокер', key: 'broker', width: 220 },
  { title: 'Операция', key: 'action' },
  { title: 'Объект / Состав', dataIndex: 'objectName', key: 'objectName', width: 200 },
  { title: 'Время', dataIndex: 'time', key: 'time', width: 160 },
  { title: 'Статус', key: 'status', width: 120 },
]

const activities = ref([
  { id: '1', broker: 'Алина Нургалиева', action: 'Генерация строк реестра по составу', objectName: 'Поезд 2457 / ATG-12', time: '10 мин назад' },
  { id: '2', broker: 'Сергей Ким', action: 'Сопоставление ТСД для контейнера MSKU8928302', objectName: 'Поезд 1042 / ZIM-33', time: '40 мин назад' },
  { id: '3', broker: 'Данияр Ахметов', action: 'Регистрация контейнера в ЖДН', objectName: 'Поезд 1928 / EXP-04', time: '2 часа назад' },
  { id: '4', broker: 'Алина Нургалиева', action: 'Создание карточки ТСД получателя', objectName: 'Поезд 2457 / ATG-12', time: '3 часа назад' },
])

const refreshData = async () => {
  loading.value = true
  // Simulate API reload
  await new Promise((resolve) => setTimeout(resolve, 600))
  kpis.value = {
    activeTrains: Math.floor(5 + Math.random() * 8),
    processedContainers: Math.floor(120 + Math.random() * 40),
    totalDeclarations: Math.floor(350 + Math.random() * 80),
    avgProcessingTime: '16 мин',
  }
  loading.value = false
}

onMounted(() => {
  void refreshData()
})
</script>

<style scoped>
.analytics-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* KPI Cards layout */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: var(--atg-radius-lg);
  border: 1px solid var(--atg-line);
  background: var(--atg-surface);
  box-shadow: var(--atg-shadow);
  transition: transform var(--atg-transition), box-shadow var(--atg-transition);
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--atg-shadow-md);
}

.kpi-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 10px;
  font-size: 20px;
  flex-shrink: 0;
}

/* Colors for KPIs */
.teal-gradient-bg .kpi-icon-wrap {
  background: var(--atg-teal-soft);
  color: var(--atg-accent-strong);
}
.gold-gradient-bg .kpi-icon-wrap {
  background: var(--atg-gold-soft);
  color: #a17f2a;
}
.navy-gradient-bg .kpi-icon-wrap {
  background: rgba(27, 42, 74, 0.08);
  color: var(--atg-navy);
}
.accent-soft-bg .kpi-icon-wrap {
  background: rgba(43, 188, 212, 0.08);
  color: var(--atg-accent);
}

.kpi-content {
  display: flex;
  flex-direction: column;
}

.kpi-content span {
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--atg-muted);
  letter-spacing: 0.04em;
}

.kpi-content strong {
  font-size: 24px;
  font-weight: 800;
  color: var(--atg-ink);
  line-height: 1.2;
  margin-top: 2px;
}

.kpi-content small {
  font-size: 11px;
  color: var(--atg-muted);
  margin-top: 4px;
}

/* Charts workspace layout */
.analytics-workspace {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 20px;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--atg-navy);
}

.card-title :deep(.anticon) {
  color: var(--atg-accent-strong);
}

/* Custom Horizontal Bar chart */
.chart-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 6px 0;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.bar-label {
  width: 180px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--atg-charcoal);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-wrapper {
  flex: 1;
  height: 12px;
  background: var(--atg-bg);
  border-radius: 999px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--atg-teal), var(--atg-teal-dark));
  border-radius: 999px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.bar-value {
  width: 60px;
  text-align: right;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--atg-navy);
}

/* Custom Funnel steps list */
.funnel-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.funnel-step {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.funnel-step-header {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
}

.funnel-step-header span {
  font-weight: 600;
  color: var(--atg-charcoal);
}

.funnel-step-header strong {
  font-weight: 800;
  color: var(--atg-navy);
}

/* Activity table styling */
.broker-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.broker-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--atg-teal-soft);
  color: var(--atg-accent-strong);
  font-weight: 800;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.activity-table :deep(.ant-table-thead > tr > th) {
  background-color: var(--atg-bg) !important;
  color: var(--atg-navy) !important;
  font-weight: 800;
}

@media (max-width: 1024px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 576px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
