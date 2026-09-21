<template>
  <div class="analytics-view crm-page">
    <PageHeader
      kicker="Владельцу"
      title="Аналитика"
      subtitle="Реальные показатели Импорта 40 и транзита: динамика, стадии, клиенты, загрузка сотрудников."
    >
      <template #actions>
        <a-button type="primary" @click="load" :loading="loading">
          <ReloadOutlined />
          Обновить
        </a-button>
      </template>
    </PageHeader>

    <a-spin :spinning="loading">
      <template v-if="a">
        <!-- KPI: 30 дней vs предыдущие 30 -->
        <div class="kpi-grid">
          <div class="kpi-card teal-gradient-bg">
            <div class="kpi-icon-wrap"><ImportOutlined /></div>
            <div class="kpi-content">
              <span>Заявок за 30 дней</span>
              <strong>{{ a.cases30d }}</strong>
              <small>{{ delta(a.cases30d, a.casesPrev30d) }} к предыдущим 30 дням</small>
            </div>
          </div>
          <div class="kpi-card gold-gradient-bg">
            <div class="kpi-icon-wrap"><FileDoneOutlined /></div>
            <div class="kpi-content">
              <span>ДТ за 30 дней</span>
              <strong>{{ a.declarations30d }}</strong>
              <small>{{ delta(a.declarations30d, a.declarationsPrev30d) }} к предыдущим 30 дням</small>
            </div>
          </div>
          <div class="kpi-card navy-gradient-bg">
            <div class="kpi-icon-wrap"><DollarOutlined /></div>
            <div class="kpi-content">
              <span>Платежи гр.В за 30 дней</span>
              <strong>{{ money(a.payments30dKzt) }} ₸</strong>
              <small>{{ delta(a.payments30dKzt, a.paymentsPrev30dKzt) }} к предыдущим 30 дням</small>
            </div>
          </div>
          <div class="kpi-card accent-soft-bg">
            <div class="kpi-icon-wrap"><HourglassOutlined /></div>
            <div class="kpi-content">
              <span>Средний срок оформления</span>
              <strong>{{ a.avgDaysToDone != null ? a.avgDaysToDone + ' дн.' : '—' }}</strong>
              <small>{{ a.activeCases }} в работе · {{ a.problemCases }} с проблемой</small>
            </div>
          </div>
        </div>

        <!-- Динамика по месяцам -->
        <a-card class="crm-shell-card" :bordered="false">
          <template #title><span class="card-title"><BarChartOutlined /> Динамика за 6 месяцев</span></template>
          <div class="months">
            <div v-for="m in a.months" :key="m.month" class="month-col">
              <div class="month-bars">
                <div class="mbar mbar--cases" :style="{ height: barH(m.cases, maxCases) }" :title="'Заявок: ' + m.cases"></div>
                <div class="mbar mbar--dt" :style="{ height: barH(m.declarations, maxDt) }" :title="'ДТ: ' + m.declarations"></div>
                <div class="mbar mbar--transit" :style="{ height: barH(m.transitEntries, maxTransit) }" :title="'Транзит: ' + m.transitEntries"></div>
              </div>
              <div class="month-label">{{ monthLabel(m.month) }}</div>
              <div class="month-nums"><b>{{ m.cases }}</b> / {{ m.declarations }} / {{ m.transitEntries }}</div>
              <div class="month-pay" v-if="m.paymentsKzt">{{ money(m.paymentsKzt) }} ₸</div>
            </div>
          </div>
          <div class="month-legend">
            <span><i class="sw sw--cases"></i>Заявки Импорт 40</span>
            <span><i class="sw sw--dt"></i>ДТ создано</span>
            <span><i class="sw sw--transit"></i>Транзит (реестр)</span>
            <span class="muted">под столбцами: заявки / ДТ / транзит, ниже — платежи гр.В за месяц</span>
          </div>
        </a-card>

        <div class="analytics-workspace">
          <!-- Клиенты по платежам -->
          <a-card class="crm-shell-card chart-card" :bordered="false">
            <template #title><span class="card-title"><BarChartOutlined /> Топ клиентов по платежам гр.В</span></template>
            <div v-if="a.topClients.length" class="chart-container">
              <div v-for="c in a.topClients" :key="c.clientId" class="bar-row">
                <div class="bar-label" :title="c.clientName">{{ c.clientName }}</div>
                <div class="bar-wrapper"><div class="bar-fill" :style="{ width: pct(c.paymentsKzt, maxPay) + '%' }"></div></div>
                <div class="bar-value">{{ money(c.paymentsKzt) }} ₸ · {{ c.cases }} заяв.</div>
              </div>
            </div>
            <a-empty v-else description="Пока нет платежей" />
          </a-card>

          <!-- Стадии -->
          <a-card class="crm-shell-card funnel-card" :bordered="false">
            <template #title><span class="card-title"><PieChartOutlined /> Заявки по стадиям (сейчас)</span></template>
            <div class="funnel-container">
              <div v-for="s in stages" :key="s.key" class="funnel-step">
                <div class="funnel-step-header"><span>{{ s.label }}</span><strong>{{ s.count }}</strong></div>
                <a-progress :percent="pct(s.count, stagesTotal)" :stroke-color="s.color" :show-info="false" stroke-width="8" />
              </div>
            </div>
          </a-card>
        </div>

        <div class="analytics-workspace">
          <!-- Загрузка сотрудников -->
          <a-card class="crm-shell-card" :bordered="false">
            <template #title><span class="card-title"><TeamOutlined /> Загрузка сотрудников</span></template>
            <a-table :columns="staffColumns" :data-source="a.staff" :pagination="false" row-key="userId" size="middle">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'user'">
                  <div class="broker-cell"><div class="broker-avatar">{{ record.username.charAt(0).toUpperCase() }}</div><strong>{{ record.username }}</strong></div>
                </template>
                <template v-else-if="column.key === 'role'"><a-tag>{{ roleLabel(record.role) }}</a-tag></template>
              </template>
              <template #emptyText><a-empty description="Назначений пока нет" /></template>
            </a-table>
          </a-card>

          <!-- Последние операции -->
          <a-card class="crm-shell-card" :bordered="false">
            <template #title><span class="card-title"><HistoryOutlined /> Последние операции</span></template>
            <a-table :columns="activityColumns" :data-source="a.recentActivity" :pagination="false" row-key="atUtc" size="middle" class="activity-table"
              :custom-row="(r: AnalyticsActivity) => ({ onClick: () => router.push(`/import-40/${r.caseId}`), style: 'cursor:pointer' })">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'case'"><strong>{{ record.clientName }}</strong><div class="muted">{{ record.cargo }}</div></template>
                <template v-else-if="column.key === 'role'"><a-tag>{{ roleLabel(record.role) }}</a-tag></template>
                <template v-else-if="column.key === 'at'">{{ fmtTime(record.atUtc) }}</template>
              </template>
              <template #emptyText><a-empty description="Операций пока нет" /></template>
            </a-table>
          </a-card>
        </div>
      </template>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined, ImportOutlined, FileDoneOutlined, DollarOutlined, HourglassOutlined,
  BarChartOutlined, PieChartOutlined, HistoryOutlined, TeamOutlined,
} from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { analyticsApi, type AnalyticsDto, type AnalyticsActivity } from '@/api/analytics'

const router = useRouter()
const loading = ref(false)
const a = ref<AnalyticsDto | null>(null)

const load = async () => {
  loading.value = true
  try { a.value = await analyticsApi.get() } catch { message.error('Не удалось загрузить аналитику') } finally { loading.value = false }
}
onMounted(load)

const money = (v: number) => Math.round(v).toLocaleString('ru-RU')
const pct = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 100) : 0)
const barH = (v: number, max: number) => (max > 0 ? Math.max(4, Math.round((v / max) * 100)) + '%' : '4%')
const delta = (cur: number, prev: number) => {
  if (!prev) return cur ? 'новое' : '0'
  const d = Math.round(((cur - prev) / prev) * 100)
  return (d >= 0 ? '+' : '') + d + '%'
}
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y!.slice(2)}` }
const fmtTime = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const roleLabel = (r: string) => ({ declarant: 'Декларант', kpp: 'КПП', client: 'Клиент', rop: 'РОП', mpp: 'Брокер', expeditor: 'Экспедитор' } as Record<string, string>)[r] ?? r

const maxCases = computed(() => Math.max(...(a.value?.months.map((m) => m.cases) ?? [0]), 1))
const maxDt = computed(() => Math.max(...(a.value?.months.map((m) => m.declarations) ?? [0]), 1))
const maxTransit = computed(() => Math.max(...(a.value?.months.map((m) => m.transitEntries) ?? [0]), 1))
const maxPay = computed(() => Math.max(...(a.value?.topClients.map((c) => c.paymentsKzt) ?? [0]), 1))

const STAGE_META: Record<string, { label: string; color: string }> = {
  draft: { label: 'Заявка и документы', color: '#8896ac' },
  border: { label: 'Граница', color: '#3b6fd6' },
  declaring: { label: 'Декларирование', color: '#2BBCD4' },
  svh: { label: 'СВХ и счёт', color: '#C9A84C' },
  payment: { label: 'Оплата', color: '#e07a30' },
  done: { label: 'Выполнено', color: '#10b981' },
}
const stages = computed(() => (a.value?.stages ?? []).map((s) => ({ ...s, ...(STAGE_META[s.key] ?? { label: s.key, color: '#8896ac' }) })))
const stagesTotal = computed(() => stages.value.reduce((acc, s) => acc + s.count, 0))

const staffColumns = [
  { title: 'Сотрудник', key: 'user', width: 220 },
  { title: 'Роль', key: 'role', width: 120 },
  { title: 'В работе', dataIndex: 'activeCases', key: 'activeCases', width: 100 },
  { title: 'Выполнено', dataIndex: 'doneCases', key: 'doneCases', width: 110 },
]
const activityColumns = [
  { title: 'Заявка', key: 'case', width: 220 },
  { title: 'Операция', dataIndex: 'text', key: 'text' },
  { title: 'Кто', key: 'role', width: 110 },
  { title: 'Когда', key: 'at', width: 120 },
]
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

/* Помесячная динамика */
.months { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; align-items: end; }
.month-col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.month-bars { display: flex; align-items: flex-end; gap: 4px; height: 120px; width: 100%; justify-content: center; }
.mbar { width: 18px; border-radius: 6px 6px 2px 2px; transition: height .2s; }
.mbar--cases { background: var(--atg-teal, #22b8d0); }
.mbar--dt { background: var(--z-gold, #C9A84C); }
.mbar--transit { background: #3b6fd6; }
.month-label { font-size: 12px; font-weight: 700; color: var(--atg-ink, #182640); text-transform: uppercase; letter-spacing: .04em; }
.month-nums { font-size: 12px; color: var(--atg-muted, #6b7891); }
.month-pay { font-size: 11.5px; color: var(--atg-teal-dark, #149bb2); font-weight: 600; }
.month-legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 14px; font-size: 12px; color: var(--atg-muted, #6b7891); }
.month-legend .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.sw--cases { background: var(--atg-teal, #22b8d0); } .sw--dt { background: var(--z-gold, #C9A84C); } .sw--transit { background: #3b6fd6; }
.muted { color: var(--atg-muted, #95a1b7); font-size: 12px; }
@media (max-width: 900px) { .months { grid-template-columns: repeat(3, 1fr); } }
</style>

