<template>
  <div class="manage-view crm-page">
    <PageHeader kicker="Руководителю" title="Управление заявками" subtitle="Кто над чем работает: назначения декларантов и КПП, проблемные и зависшие заявки.">
      <template #actions>
        <a-button :loading="loading" @click="load">Обновить</a-button>
      </template>
    </PageHeader>

    <a-spin :spinning="loading">
      <template v-if="data">
        <div class="kpi-row">
          <div class="kpi" :class="{ 'kpi--attn': data.unassigned }" @click="filter = 'unassigned'"><span>Без назначения</span><b>{{ data.unassigned }}</b><small>на шаге сотрудника никто не назначен</small></div>
          <div class="kpi" :class="{ 'kpi--bad': data.problems }" @click="filter = 'problems'"><span>Проблемные</span><b>{{ data.problems }}</b><small>запрос таможни / проблема</small></div>
          <div class="kpi" :class="{ 'kpi--attn': data.stale }" @click="filter = 'stale'"><span>Зависли</span><b>{{ data.stale }}</b><small>без движения 5+ дней</small></div>
          <div class="kpi"><span>Активных заявок</span><b>{{ data.cases.length }}</b><small>всего в работе</small></div>
        </div>

        <div class="grid">
          <a-card class="crm-shell-card" :bordered="false">
            <div class="filters">
              <a-input v-model:value="search" allow-clear placeholder="Поиск по клиенту, грузу" style="max-width: 280px"><template #prefix><SearchOutlined /></template></a-input>
              <a-segmented v-model:value="filter" :options="filterOptions" />
            </div>
            <a-table :columns="columns" :data-source="filtered" row-key="id" size="middle" :pagination="{ pageSize: 25, showSizeChanger: false }" :scroll="{ x: 1000 }"
              :row-class-name="(r: ManageCase) => (r.isProblem ? 'row-problem' : r.daysSinceUpdate >= 5 ? 'row-stale' : '')">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'case'">
                  <a class="cell-main" @click="router.push(`/import-40/${record.id}`)">{{ record.clientName }}</a>
                  <div class="cell-sub">{{ record.cargo }}<span v-if="record.post"> · {{ record.post }}</span></div>
                </template>
                <template v-else-if="column.key === 'step'">
                  <a-tag :color="record.isProblem ? 'error' : 'processing'">шаг {{ stepForStatus(record.status) }}/{{ TOTAL_STEPS }} · {{ statusLabel(record.status) }}</a-tag>
                  <div v-if="record.isProblem && record.problemNote" class="cell-sub problem-note">{{ record.problemNote }}</div>
                </template>
                <template v-else-if="column.key === 'declarant'">
                  <a-select :value="record.assignedDeclarantId ?? undefined" :options="declarantOptions" allow-clear size="small" placeholder="—" style="width: 100%"
                    :class="{ 'need-assign': needsDeclarant(record.status) && !record.assignedDeclarantId }"
                    @change="(v: string | undefined) => assign(record, 'assignedDeclarantId', v)" />
                </template>
                <template v-else-if="column.key === 'kpp'">
                  <a-select :value="record.assignedKppId ?? undefined" :options="kppOptions" allow-clear size="small" placeholder="—" style="width: 100%"
                    :class="{ 'need-assign': needsKpp(record.status) && !record.assignedKppId }"
                    @change="(v: string | undefined) => assign(record, 'assignedKppId', v)" />
                </template>
                <template v-else-if="column.key === 'days'">
                  <span class="tnum">{{ record.daysInWork }}</span>
                  <div class="cell-sub" :class="{ 'stale-txt': record.daysSinceUpdate >= 5 }">обновл. {{ record.daysSinceUpdate }} дн. назад</div>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-button v-if="record.isProblem" size="small" @click="clearProblem(record)">Снять проблему</a-button>
                </template>
              </template>
              <template #emptyText><a-empty description="Активных заявок нет" /></template>
            </a-table>
          </a-card>

          <a-card class="crm-shell-card" :bordered="false" title="Загрузка сотрудников">
            <div v-for="s in staffLoad" :key="s.id" class="load-row">
              <div class="load-name">{{ s.label }}<div class="cell-sub">{{ s.roles.map(businessRoleLabel).join(', ') }}</div></div>
              <div class="load-bar"><span :style="{ width: loadPct(s.count) + '%' }" /></div>
              <b class="tnum">{{ s.count }}</b>
            </div>
            <a-empty v-if="!staffLoad.length" description="Нет сотрудников с ролями декларант/КПП" />
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
import { SearchOutlined } from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { manageApi, type ManageOverview, type ManageCase } from '@/api/manage'
import { import40Api, IMPORT40_STATUSES } from '@/api/import40'
import { TOTAL_STEPS, stepForStatus } from '@/utils/import40Steps'
import { businessRoleLabel } from '@/api/permissions'

const router = useRouter()
const loading = ref(false)
const data = ref<ManageOverview | null>(null)
const search = ref('')
const filter = ref<'all' | 'unassigned' | 'problems' | 'stale'>('all')
const filterOptions = [
  { label: 'Все', value: 'all' },
  { label: 'Без назначения', value: 'unassigned' },
  { label: 'Проблемные', value: 'problems' },
  { label: 'Зависли', value: 'stale' },
]

const load = async () => {
  loading.value = true
  try { data.value = await manageApi.overview() } catch { message.error('Не удалось загрузить панель') } finally { loading.value = false }
}
onMounted(load)

const needsKpp = (s: number) => [1, 4, 5, 6].includes(s)
const needsDeclarant = (s: number) => [2, 3].includes(s)
const statusLabel = (s: number) => IMPORT40_STATUSES.find((x) => x.id === s)?.short ?? String(s)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (data.value?.cases ?? []).filter((c) => {
    if (filter.value === 'unassigned' && !((needsKpp(c.status) && !c.assignedKppId) || (needsDeclarant(c.status) && !c.assignedDeclarantId))) return false
    if (filter.value === 'problems' && !c.isProblem) return false
    if (filter.value === 'stale' && c.daysSinceUpdate < 5) return false
    return !q || [c.clientName, c.cargo, c.post].join(' ').toLowerCase().includes(q)
  })
})

const staffLabel = (u: { displayName: string | null; username: string }) => u.displayName || u.username
const declarantOptions = computed(() => (data.value?.staff ?? []).filter((u) => u.roles.includes('declarant')).map((u) => ({ value: u.id, label: staffLabel(u) })))
const kppOptions = computed(() => (data.value?.staff ?? []).filter((u) => u.roles.includes('kpp')).map((u) => ({ value: u.id, label: staffLabel(u) })))

const staffLoad = computed(() => (data.value?.staff ?? [])
  .filter((u) => u.roles.includes('declarant') || u.roles.includes('kpp'))
  .map((u) => ({ id: u.id, label: staffLabel(u), roles: u.roles, count: (data.value?.cases ?? []).filter((c) => c.assignedDeclarantId === u.id || c.assignedKppId === u.id).length }))
  .sort((a, b) => b.count - a.count))
const loadMax = computed(() => Math.max(...staffLoad.value.map((s) => s.count), 1))
const loadPct = (n: number) => Math.max(Math.round((n / loadMax.value) * 100), n ? 6 : 0)

const columns = [
  { title: 'Заявка', key: 'case', width: 260 },
  { title: 'Шаг', key: 'step', width: 230 },
  { title: 'Декларант', key: 'declarant', width: 170 },
  { title: 'КПП', key: 'kpp', width: 170 },
  { title: 'Дней', key: 'days', width: 120 },
  { title: '', key: 'actions', width: 140 },
]

const assign = async (c: ManageCase, field: 'assignedKppId' | 'assignedDeclarantId', value: string | undefined) => {
  try {
    // Guid.Empty на бэке = «снять назначение».
    await import40Api.update(c.id, { [field]: value ?? '00000000-0000-0000-0000-000000000000' })
    c[field] = value ?? null
    message.success('Назначение сохранено')
    if (data.value) data.value.unassigned = data.value.cases.filter((x) => (needsKpp(x.status) && !x.assignedKppId) || (needsDeclarant(x.status) && !x.assignedDeclarantId)).length
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    message.error(err.response?.data?.error ?? 'Не удалось назначить')
  }
}
const clearProblem = async (c: ManageCase) => {
  try { await import40Api.action(c.id, 'clear-problem'); message.success('Проблема снята'); await load() } catch { message.error('Не удалось снять проблему') }
}
</script>

<style scoped>
.manage-view { display: flex; flex-direction: column; gap: 18px; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.kpi { background: #fff; border: 1px solid var(--z-line, #e8ecf4); border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; }
.kpi > span { font-size: 11.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--atg-muted, #6b7891); }
.kpi > b { font-family: var(--font-display, 'Manrope', sans-serif); font-size: 26px; font-weight: 800; color: var(--atg-ink, #182640); }
.kpi > small { font-size: 12px; color: var(--atg-muted, #95a1b7); }
.kpi--attn > b { color: #e07a30; } .kpi--bad > b { color: #cf4a3c; }
.grid { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.cell-main { font-weight: 600; color: var(--atg-ink, #182640); cursor: pointer; }
.cell-sub { font-size: 12px; color: var(--atg-muted, #95a1b7); }
.problem-note { color: #cf4a3c; }
.stale-txt { color: #e07a30; font-weight: 600; }
:deep(.row-problem) td { background: rgba(207, 74, 60, 0.05); }
:deep(.row-stale) td { background: rgba(224, 122, 48, 0.05); }
:deep(.need-assign .ant-select-selector) { border-color: #e07a30 !important; box-shadow: 0 0 0 2px rgba(224, 122, 48, 0.12); }
.load-row { display: grid; grid-template-columns: 1fr 100px 32px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--z-line-2, #eff2f8); }
.load-row:last-child { border-bottom: 0; }
.load-name { font-weight: 600; color: var(--atg-ink, #182640); font-size: 13px; }
.load-bar { height: 6px; border-radius: 4px; background: var(--z-line-2, #eff2f8); overflow: hidden; }
.load-bar span { display: block; height: 100%; background: var(--atg-teal, #22b8d0); border-radius: 4px; }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } .kpi-row { grid-template-columns: repeat(2, 1fr); } }
</style>
