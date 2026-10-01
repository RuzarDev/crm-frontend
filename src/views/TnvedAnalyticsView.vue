<template>
  <div class="tnved-analytics-view crm-page">
    <PageHeader :kicker="t('sales.tnVedEaes')" :title="t('sales.analitika')" :subtitle="t('sales.topKodovPoVashim')" />

    <a-row :gutter="16">
      <!-- Top codes -->
      <a-col :xs="24" :lg="12">
        <a-card :title="t('sales.topIspolzuemyhKodov')" class="crm-shell-card" :bordered="false">
          <a-spin :spinning="topLoading">
            <div v-if="!topLoading && topCodes.length === 0" class="empty-hint">{{ t('sales.netDannyh') }}</div>
            <div v-else class="top-list">
              <div v-for="(item, i) in topCodes" :key="item.code" class="top-item">
                <span class="rank">{{ i + 1 }}</span>
                <div class="top-info">
                  <div class="top-code-row">
                    <a-typography-text code style="font-size:13px">{{ item.code }}</a-typography-text>
                    <a-tag v-if="item.rateStr" color="orange" style="font-size:12px">{{ item.rateStr }}</a-tag>
                  </div>
                  <div class="top-name">{{ item.treeName || '—' }}</div>
                </div>
                <div class="top-count">
                  <a-badge :count="item.declarationCount" :overflow-count="9999" color="#23B5D3" />
                  <span class="count-label">{{ t('sales.dekl') }}</span>
                </div>
              </div>
            </div>
          </a-spin>
        </a-card>
      </a-col>

      <!-- VTO sections -->
      <a-col :xs="24" :lg="12">
        <a-card :title="t('sales.razdelyVto')" class="crm-shell-card" :bordered="false">
          <a-spin :spinning="vtoLoading">
            <div v-if="!vtoLoading && vtoSections.length === 0" class="empty-hint">{{ t('sales.netDannyh') }}</div>
            <a-collapse v-else :bordered="false" ghost>
              <a-collapse-panel
                v-for="section in vtoSections"
                :key="section.name"
                :header="section.name"
              >
                <template #extra>
                  <a-tag color="blue" style="font-size:12px">{{ t('sales.kodov', { n: section.totalCodes }) }}</a-tag>
                </template>
                <div class="vto-groups">
                  <div v-for="g in section.groups" :key="g.code" class="vto-group">
                    <a-typography-text code style="font-size:12px;flex-shrink:0">{{ g.code }}</a-typography-text>
                    <span class="vto-hint">{{ g.hint }}</span>
                  </div>
                </div>
              </a-collapse-panel>
            </a-collapse>
          </a-spin>
        </a-card>
      </a-col>
    </a-row>

    <!-- Rate changes -->
    <a-card :title="t('sales.poslednieIzmeneniyaStavok')" class="crm-shell-card" :bordered="false" style="margin-top:16px">
      <a-spin :spinning="changesLoading">
        <div v-if="!changesLoading && rateChanges.length === 0" class="empty-hint">{{ t('sales.netDannyh') }}</div>
        <a-table
          v-else
          :data-source="rateChanges"
          :columns="changesColumns"
          :pagination="{ pageSize: 15, showSizeChanger: false }"
          size="small"
          row-key="(r, i) => i"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'change'">
              <span class="old-rate">{{ record.oldRateStr || '—' }}</span>
              <span class="arrow"> → </span>
              <a-tag color="orange" v-if="record.newRateStr">{{ record.newRateStr }}</a-tag>
              <span v-else class="muted">—</span>
            </template>
            <template v-if="column.key === 'changedAtUtc'">
              <span class="date-cell">{{ fmtDate(record.changedAtUtc) }}</span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, computed } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedTopCodeDto, TnvedVtoSectionDto, TnvedRateChangeDto } from '@/types/api'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

const topCodes = ref<TnvedTopCodeDto[]>([])
const topLoading = ref(false)

const vtoSections = ref<TnvedVtoSectionDto[]>([])
const vtoLoading = ref(false)

const rateChanges = ref<TnvedRateChangeDto[]>([])
const changesLoading = ref(false)

const changesColumns = computed(() => ([

  { title: t('sales.kod'), dataIndex: 'code', key: 'code', width: 130 },
  { title: t('sales.naimenovanie'), dataIndex: 'treeName', key: 'treeName', ellipsis: true },
  { title: t('sales.izmenenieStavki'), key: 'change', width: 200 },
  { title: t('sales.data'), key: 'changedAtUtc', width: 130 },
]))
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

onMounted(() => {
  topLoading.value = true
  tnvedApi.topCodes(20).then(r => { topCodes.value = r.data }).finally(() => { topLoading.value = false })

  vtoLoading.value = true
  tnvedApi.vtoSections().then(r => { vtoSections.value = r.data }).finally(() => { vtoLoading.value = false })

  changesLoading.value = true
  tnvedApi.rateChanges(50).then(r => { rateChanges.value = r.data }).finally(() => { changesLoading.value = false })
})
</script>

<style scoped>
.top-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.top-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--z-line);
}
.top-item:last-child { border-bottom: none; }

.rank {
  font-size: 16px;
  font-weight: 800;
  color: var(--z-muted);
  min-width: 24px;
  text-align: center;
}

.top-info { flex: 1; min-width: 0; }

.top-code-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.top-name {
  font-size: 12px;
  color: var(--z-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-count {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.count-label {
  font-size: 12px;
  color: var(--z-muted);
}

.vto-groups {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.vto-group {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}

.vto-hint {
  font-size: 12px;
  color: var(--z-ink);
  line-height: 1.4;
}

.old-rate { color: var(--z-muted); font-size: 13px; }
.arrow { color: var(--z-muted); }
.date-cell { font-size: 12px; color: var(--z-muted); }
.muted { color: var(--z-muted); }

.empty-hint {
  color: var(--z-muted);
  text-align: center;
  padding: 32px 0;
  font-size: 13px;
}
</style>
