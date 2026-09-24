<!-- Журнал действий по системе: кто менял права, блокировал клиентов, отзывал документы.
     Раньше логи были только внутри заявки (аудит 2026-09-23). -->
<template>
  <div class="audit-view crm-page">
    <PageHeader :kicker="t('audit.kicker')" :title="t('audit.title')" :subtitle="t('audit.subtitle')">
      <template #actions>
        <a-select v-model:value="days" :options="daysOptions" style="width: 170px" @change="load" />
        <a-button :loading="loading" @click="load">{{ t('audit.refresh') }}</a-button>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="filters">
        <a-input v-model:value="search" allow-clear :placeholder="t('audit.searchPh')" style="max-width: 320px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
      </div>

      <a-table :columns="columns" :data-source="filtered" :loading="loading" row-key="id" size="middle"
        :pagination="filtered.length > 30 ? { pageSize: 30, showSizeChanger: false } : false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'at'">{{ fmt(record.atUtc) }}</template>
          <template v-else-if="column.key === 'actor'">
            <div class="cell-main">{{ record.actorName }}</div>
            <div class="cell-sub">{{ record.actorRole }}</div>
          </template>
          <template v-else-if="column.key === 'action'"><a-tag>{{ record.action }}</a-tag></template>
        </template>
        <template #emptyText><a-empty :description="t('audit.empty')" /></template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { systemApi, type AuditRow } from '@/api/system'

const { t } = useI18n()
const loading = ref(false)
const rows = ref<AuditRow[]>([])
const search = ref('')
const days = ref(30)

const daysOptions = computed(() => [
  { value: 7, label: t('audit.days7') },
  { value: 30, label: t('audit.days30') },
  { value: 90, label: t('audit.days90') },
  { value: 0, label: t('audit.daysAll') },
])

const load = async () => {
  loading.value = true
  try {
    rows.value = await systemApi.audit(days.value ? { days: days.value } : undefined)
  } catch {
    message.error(t('audit.loadError'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) => [r.actorName, r.action, r.summary, r.entityType].join(' ').toLowerCase().includes(q))
})

const columns = computed(() => [
  { title: t('audit.colAt'), key: 'at', width: 160 },
  { title: t('audit.colActor'), key: 'actor', width: 200 },
  { title: t('audit.colAction'), key: 'action', width: 180 },
  { title: t('audit.colSummary'), dataIndex: 'summary', key: 'summary' },
])

const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU')
</script>

<style scoped>
.audit-view { display: flex; flex-direction: column; gap: 18px; }
.filters { margin-bottom: 14px; }
.cell-main { font-weight: 600; color: var(--atg-ink, #182640); }
.cell-sub { font-size: 12px; color: var(--atg-muted, #95a1b7); }
</style>
