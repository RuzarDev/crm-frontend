<template>
  <div class="keden-status-page crm-page">
    <PageHeader
      kicker="ИС «KEDEN»"
      title="Статусы КЕДЕН"
      subtitle="Статусы ваших деклараций в keden.kgd.gov.kz, отфильтрованные по БИН."
    >
      <template #actions>
        <a-button :loading="loading" @click="reload">Обновить</a-button>
        <span class="crm-stat-badge">Всего:&nbsp;<span class="crm-stat-badge-count">{{ items.length }}</span></span>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="filters-row">
        <a-input
          v-model:value="search"
          allow-clear
          placeholder="Поиск по рег. номеру"
          style="max-width: 360px"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
      </div>

      <a-table
        :columns="columns"
        :data-source="filteredItems"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: false }"
        :scroll="{ x: 960 }"
        row-key="id"
      >
        <template #emptyText>
          <a-empty description="Деклараций пока нет" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'registrationNumber'">
            {{ record.registrationNumber || '—' }}
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.statusName)">{{ record.statusName || '—' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'statusDate'">
            {{ formatDate(record.statusDateTimeUtc) }}
          </template>
          <template v-else-if="column.key === 'customsPost'">
            {{ record.customsPost || '—' }}
          </template>
          <template v-else-if="column.key === 'declarantName'">
            {{ record.declarantName || '—' }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { SearchOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { kedenApi } from '@/api/keden'
import type { KedenDeclarationStatus } from '@/types/api'
import PageHeader from '@/components/PageHeader.vue'

const loading = ref(false)
const items = ref<KedenDeclarationStatus[]>([])
const search = ref('')

const columns = [
  { title: 'Рег. номер', key: 'registrationNumber', width: 220 },
  { title: 'Статус', key: 'status', width: 200 },
  { title: 'Дата', key: 'statusDate', width: 170 },
  { title: 'Пост', key: 'customsPost', width: 160 },
  { title: 'Декларант', key: 'declarantName', width: 220 },
]

const formatDate = (iso: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : '—')

// Цвет тега по человекочитаемому названию статуса (a-tag).
const statusColor = (name: string | null): string => {
  const s = (name || '').toLowerCase()
  if (!s) return 'default'
  if (s.includes('отказ')) return 'red'
  if (s.includes('условн')) return 'orange'
  if (s.includes('выпущен') || s.includes('завершен') || s.includes('выпуск разреш')) return 'green'
  return 'default'
}

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) => (i.registrationNumber || '').toLowerCase().includes(q))
})

const reload = async () => {
  loading.value = true
  try {
    items.value = await kedenApi.mine()
  } catch (e: any) {
    message.error(e?.response?.data?.message ?? 'Не удалось загрузить статусы')
  } finally {
    loading.value = false
  }
}

onMounted(() => void reload())
</script>

<style scoped>
.keden-status-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.filters-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
</style>
