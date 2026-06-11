<template>
  <div class="tnved-regulations-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">ТН ВЭД ЕАЭС</div>
        <h1 class="crm-page-title">Нормативные акты</h1>
        <p class="crm-page-subtitle">Решения, постановления и иные НПА в сфере ВТО.</p>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-input-search
        v-model:value="filterQuery"
        placeholder="Поиск по номеру…"
        allow-clear
        style="max-width:360px;margin-bottom:16px"
      />

      <a-spin :spinning="loading">
        <div v-if="!loading && filtered.length === 0" class="empty-hint">Нормативные акты не найдены</div>

        <a-table
          v-else
          :data-source="filtered"
          :columns="columns"
          :pagination="{ pageSize: 20, showSizeChanger: false }"
          size="small"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'number'">
              <a v-if="record.url" :href="record.url" target="_blank" rel="noopener" class="doc-link">
                {{ record.number }}
              </a>
              <span v-else>{{ record.number }}</span>
            </template>
            <template v-if="column.key === 'date'">
              <span>{{ fmtDate(record.dateStr, record.date) }}</span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedRegulationDto } from '@/types/api'

const regs = ref<TnvedRegulationDto[]>([])
const loading = ref(false)
const filterQuery = ref('')

const filtered = computed(() => {
  if (!filterQuery.value.trim()) return regs.value
  const q = filterQuery.value.toLowerCase()
  return regs.value.filter(r => r.number.toLowerCase().includes(q))
})

const columns = [
  { title: 'Номер документа', key: 'number', dataIndex: 'number', ellipsis: true },
  { title: 'Дата', key: 'date', width: 140 },
]

function fmtDate(dateStr: string | null, date: string | null) {
  if (dateStr) return dateStr
  if (date) return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return '—'
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await tnvedApi.regulations()
    regs.value = data
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.doc-link {
  color: var(--atg-accent-strong);
  font-weight: 500;
}
.doc-link:hover { text-decoration: underline; }
.empty-hint {
  color: var(--atg-muted);
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
}
</style>
