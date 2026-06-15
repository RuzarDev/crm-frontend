<template>
  <div class="tnved-currencies-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">ТН ВЭД ЕАЭС</div>
        <h1 class="crm-page-title">Курсы валют</h1>
        <p class="crm-page-subtitle">Официальные курсы для таможенных расчётов.</p>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-spin :spinning="loading">
        <div v-if="!loading && currencies.length === 0" class="empty-hint">Данные о курсах не найдены</div>

        <a-table
          v-else
          :data-source="currencies"
          :columns="columns"
          :pagination="false"
          size="small"
          row-key="codeLat"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'codeLat'">
              <a-tag color="blue" style="font-family:monospace;font-weight:700">{{ record.codeLat }}</a-tag>
            </template>
            <template v-if="column.key === 'rate'">
              <strong>{{ fmtRate(record.rate) }}</strong>
              <span class="kzt-label"> KZT</span>
            </template>
            <template v-if="column.key === 'updatedAtUtc'">
              <span class="date-cell">{{ fmtDate(record.updatedAtUtc) }}</span>
            </template>
          </template>
        </a-table>

        <div v-if="updatedAt" class="footer-note">
          Обновлено: {{ updatedAt }}
        </div>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedCurrencyDto } from '@/types/api'

const currencies = ref<TnvedCurrencyDto[]>([])
const loading = ref(false)

const updatedAt = computed(() => {
  if (!currencies.value.length) return null
  const dates = currencies.value.map(c => new Date(c.updatedAtUtc).getTime())
  return fmtDate(new Date(Math.max(...dates)).toISOString())
})

const columns = [
  { title: 'Код', key: 'codeLat', dataIndex: 'codeLat', width: 90 },
  { title: 'Наименование', dataIndex: 'name', key: 'name' },
  { title: 'Курс (за 1 ед.)', key: 'rate', dataIndex: 'rate', width: 160 },
  { title: 'Обновлено', key: 'updatedAtUtc', dataIndex: 'updatedAtUtc', width: 150 },
]

function fmtRate(rate: number) {
  return new Intl.NumberFormat('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await tnvedApi.currencies()
    currencies.value = data
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.kzt-label {
  font-size: 11px;
  color: var(--atg-muted);
  margin-left: 2px;
}
.date-cell {
  font-size: 12px;
  color: var(--atg-muted);
}
.footer-note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--atg-muted);
  text-align: right;
}
.empty-hint {
  color: var(--atg-muted);
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
}
</style>
