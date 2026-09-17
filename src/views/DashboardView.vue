<template>
  <div class="dashboard-view crm-page">
    <PageHeader title="Дашборд" subtitle="Сводная статистика по реестру деклараций и клиентскому портфелю.">
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
          <div class="kpi kpi--navy">
            <div class="kpi-top">
              <span class="kpi-label">Всего деклараций</span>
              <span class="kpi-ic"><DatabaseOutlined /></span>
            </div>
            <div class="kpi-val tnum">{{ formatNum(store.data.totalEntries) }}</div>
            <div class="kpi-sub">{{ formatNum(store.data.entriesThisMonth) }} в этом месяце · {{ inProgressCount }} в работе</div>
          </div>

          <div class="kpi kpi--teal">
            <div class="kpi-top">
              <span class="kpi-label">Общий вес брутто</span>
              <span class="kpi-ic"><InboxOutlined /></span>
            </div>
            <div class="kpi-val tnum">{{ formatNum(Math.round(store.data.totalWeightKg)) }}<span class="kpi-unit">кг</span></div>
            <div class="kpi-sub">≈ {{ formatNum(Math.round(store.data.totalWeightKg / 1000)) }} тонн по всем партиям</div>
          </div>

          <div class="kpi kpi--hero">
            <span class="kpi-strip"></span>
            <div class="kpi-top">
              <span class="kpi-label">Итого с НДС</span>
              <span class="kpi-ic"><DollarOutlined /></span>
            </div>
            <div class="kpi-val tnum">{{ formatNum(Math.round(store.data.totalGrandTotal)) }}<span class="kpi-unit">₸</span></div>
            <div class="kpi-sub">суммарная стоимость с налогами</div>
          </div>

          <div class="kpi kpi--green">
            <div class="kpi-top">
              <span class="kpi-label">Выпущено</span>
              <span class="kpi-ic"><CheckCircleOutlined /></span>
            </div>
            <div class="kpi-val tnum">{{ releasedCount }}<span class="kpi-unit">/ {{ store.data.totalEntries }}</span></div>
            <div class="kpi-sub">{{ releasedPct }}% реестра выпущено в свободное обращение</div>
          </div>
        </div>

        <!-- Status distribution -->
        <a-card class="crm-shell-card" :bordered="false" title="Декларации по статусам">
          <div v-if="statusTotal > 0" class="dist">
            <div class="distbar">
              <span
                v-for="item in store.data.byStatus"
                :key="item.status"
                :style="{ width: pct(item.count) + '%', background: statusColor(item.status) }"
                :title="item.status + ': ' + item.count"
              />
            </div>
            <div class="legend">
              <div v-for="item in store.data.byStatus" :key="item.status" class="leg">
                <span class="leg-sw" :style="{ background: statusColor(item.status) }" />
                <span class="leg-nm"><StatusPill :status="item.status" /></span>
                <span class="leg-ct tnum">{{ item.count }}</span>
                <span class="leg-pc tnum">{{ pct(item.count) }}%</span>
              </div>
            </div>
          </div>
          <EmptyState v-else title="Нет данных по статусам" />
        </a-card>

        <!-- Top clients + top codes -->
        <div class="bottom-row">
          <a-card class="crm-shell-card" :bordered="false" title="Топ клиентов">
            <EmptyState v-if="!store.data.topClients?.length" title="Нет данных по клиентам" />
            <div v-else class="ranklist">
              <div v-for="(c, i) in store.data.topClients" :key="c.clientId" class="rank-row">
                <span class="rank-badge" :class="{ 'rank-badge--gold': i === 0 }">{{ i + 1 }}</span>
                <div class="rank-grow">
                  <div class="rank-name">{{ c.displayName || c.username }}</div>
                  <div v-if="c.displayName" class="rank-sub">@{{ c.username }}</div>
                  <div class="mini"><span :style="{ width: rankWidth(c.count, clientMax) + '%' }" /></div>
                </div>
                <div class="rank-cnt tnum">{{ c.count }}<small> декл.</small></div>
              </div>
            </div>
          </a-card>

          <a-card class="crm-shell-card" :bordered="false" title="Топ кодов ТН ВЭД">
            <EmptyState v-if="!store.data.topCodes?.length" title="Нет данных по кодам ТН ВЭД" />
            <div v-else class="ranklist">
              <div v-for="(c, i) in store.data.topCodes" :key="c.code" class="rank-row">
                <span class="rank-badge" :class="{ 'rank-badge--gold': i === 0 }">{{ i + 1 }}</span>
                <div class="rank-grow">
                  <span class="code-badge">{{ c.code }}</span>
                  <div v-if="c.treeName" class="rank-sub code-desc">{{ c.treeName }}</div>
                </div>
                <div class="rank-cnt tnum">{{ c.count }}</div>
              </div>
            </div>
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
import { computed, onMounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import {
  DatabaseOutlined,
  DollarOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const store = useDashboardStore()

onMounted(() => store.fetch())

// Разряды тысяч неразрывным пробелом (ru-RU), для табличных цифр.
const formatNum = (n?: number) => (n ?? 0).toLocaleString('ru-RU')

const STATUS_COLORS: Record<string, string> = {
  InProgress: '#2BBCD4',
  Submitted: '#3b6fd6',
  Released: '#1f9d6a',
  ConditionallyReleased: '#C9A84C',
  Problematic: '#e07a30',
  Rejected: '#cf4a3c',
  Withdrawn: '#8896ac',
  Archived: '#c4cad9',
}
const statusColor = (s: string) => STATUS_COLORS[s] ?? '#8896ac'

const statusTotal = computed(() =>
  (store.data?.byStatus ?? []).reduce((a, x) => a + x.count, 0),
)
const pct = (count: number) =>
  statusTotal.value ? Math.round((count / statusTotal.value) * 100) : 0

const countByStatus = (s: string) =>
  store.data?.byStatus.find((x) => x.status === s)?.count ?? 0
const releasedCount = computed(() => countByStatus('Released'))
const inProgressCount = computed(() => countByStatus('InProgress'))
const releasedPct = computed(() =>
  store.data?.totalEntries
    ? Math.round((releasedCount.value / store.data.totalEntries) * 100)
    : 0,
)

const clientMax = computed(() =>
  Math.max(...(store.data?.topClients?.map((c) => c.count) ?? [1]), 1),
)
const rankWidth = (count: number, max: number) =>
  Math.max(Math.round((count / max) * 100), 6)
</script>

<style scoped>
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

/* ── KPI tiles ── */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-4);
}

.kpi {
  position: relative;
  overflow: hidden;
  background: var(--z-surface, #fff);
  border: 1px solid var(--z-line, #e8ecf4);
  border-radius: 14px;
  padding: 18px 18px 16px;
  box-shadow: 0 1px 2px rgba(21, 37, 65, 0.04), 0 8px 24px -12px rgba(21, 37, 65, 0.14);
}

.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.kpi-label {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--atg-muted, #6b7891);
}

.kpi-ic {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 17px;
}

.kpi-val {
  font-family: var(--font-display, 'Manrope', sans-serif);
  font-weight: 800;
  font-size: 28px;
  letter-spacing: -0.6px;
  line-height: 1;
  color: var(--atg-ink, #182640);
}

.kpi-unit {
  font-size: 14px;
  font-weight: 600;
  color: var(--atg-muted, #95a1b7);
  margin-left: 4px;
}

.kpi-sub {
  margin-top: 9px;
  font-size: 12px;
  color: var(--atg-muted, #6b7891);
}

.kpi--navy .kpi-ic { background: #e9eefb; color: #3b6fd6; }
.kpi--teal .kpi-ic { background: var(--z-teal-soft, #e6f7fb); color: var(--atg-teal-dark, #149bb2); }
.kpi--green .kpi-ic { background: #e4f5ee; color: #1f9d6a; }

.kpi--hero {
  background: linear-gradient(135deg, #1c3152, #152541);
  border-color: #1c3152;
}
.kpi--hero .kpi-label,
.kpi--hero .kpi-sub { color: #9fb0cf; }
.kpi--hero .kpi-val { color: #fff; }
.kpi--hero .kpi-unit { color: #8fa0c0; }
.kpi--hero .kpi-ic { background: rgba(201, 168, 76, 0.16); color: var(--z-gold, #c9a84c); }
.kpi-strip {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: var(--z-gold, #c9a84c);
}

/* ── Status distribution ── */
.distbar {
  display: flex;
  height: 14px;
  border-radius: 8px;
  overflow: hidden;
  gap: 2px;
  margin-bottom: 20px;
}
.distbar span { display: block; height: 100%; }

.legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px 26px;
}
.leg {
  display: flex;
  align-items: center;
  gap: 10px;
}
.leg-sw {
  width: 9px; height: 9px;
  border-radius: 3px;
  flex: 0 0 auto;
}
.leg-nm { flex: 1; min-width: 0; }
.leg-ct {
  font-family: var(--font-display, 'Manrope', sans-serif);
  font-weight: 700;
  font-size: 14px;
  color: var(--atg-ink, #182640);
}
.leg-pc {
  font-size: 11.5px;
  color: var(--atg-muted, #95a1b7);
  min-width: 34px;
  text-align: right;
}

/* ── Ranked lists ── */
.bottom-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-4);
}
.ranklist { display: flex; flex-direction: column; }
.rank-row {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 12px 0;
  border-bottom: 1px solid var(--z-line-2, #eff2f8);
}
.rank-row:last-child { border-bottom: 0; padding-bottom: 0; }
.rank-badge {
  width: 24px; height: 24px;
  border-radius: 7px;
  background: var(--gray-soft, #eef1f6);
  color: var(--atg-muted, #6b7891);
  font-family: var(--font-display, 'Manrope', sans-serif);
  font-weight: 700;
  font-size: 12px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.rank-badge--gold { background: var(--z-gold-soft, #f7efd7); color: #a5852f; }
.rank-grow { flex: 1; min-width: 0; }
.rank-name {
  font-weight: 650;
  font-size: 13.5px;
  color: var(--atg-ink, #182640);
}
.rank-sub {
  font-size: 11.5px;
  color: var(--atg-muted, #95a1b7);
  margin-top: 1px;
}
.mini {
  height: 6px;
  border-radius: 4px;
  background: var(--z-line-2, #eff2f8);
  margin-top: 7px;
  overflow: hidden;
}
.mini span {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--atg-teal, #22b8d0), var(--atg-teal-dark, #149bb2));
}
.rank-cnt {
  font-family: var(--font-display, 'Manrope', sans-serif);
  font-weight: 700;
  font-size: 15px;
  color: var(--atg-ink, #182640);
  flex: 0 0 auto;
}
.rank-cnt small { font-size: 11px; color: var(--atg-muted, #95a1b7); font-weight: 600; }
.code-badge {
  display: inline-block;
  font-family: 'SFMono-Regular', ui-monospace, Menlo, monospace;
  font-weight: 600;
  font-size: 13px;
  color: #3b6fd6;
  background: #e7effc;
  padding: 2px 7px;
  border-radius: 6px;
  letter-spacing: 0.02em;
}
.code-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

@media (max-width: 900px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .bottom-row { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .kpi-row { grid-template-columns: 1fr; }
  .legend { grid-template-columns: 1fr; }
}
</style>
