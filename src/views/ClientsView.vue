<template>
  <div class="clients-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Клиентский портфель</div>
        <h1 class="crm-page-title">Клиенты</h1>
        <p class="crm-page-subtitle">
          Список клиентов вашего портфеля с количеством таможенных деклараций по каждому.
        </p>
      </div>
      <div v-if="!loading" class="crm-page-actions">
        <span class="crm-stat-badge">
          <SolutionOutlined />
          Всего:&nbsp;<span class="crm-stat-badge-count">{{ clients.length }}</span>
        </span>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="clients"
        :loading="loading"
        :pagination="clients.length > 20 ? { showTotal: (total: number) => `Всего клиентов: ${total}`, showSizeChanger: false } : false"
        row-key="id"
        :scroll="{ x: 480 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'username'">
            <div class="client-name-cell">
              <div class="client-avatar">{{ getInitial(record.username) }}</div>
              <span>{{ record.username }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'declarationCount'">
            <span
              class="declaration-count"
              :class="{ 'count-zero': record.declarationCount === 0 }"
            >
              {{ record.declarationCount }}
            </span>
          </template>
        </template>

        <template #emptyText>
          <a-empty description="Клиентов пока нет" />
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { SolutionOutlined } from '@ant-design/icons-vue'
import { reestrApi } from '@/api/reestr'
import type { ReestrClientOption } from '@/types/api'

const loading = ref(false)
const clients = ref<ReestrClientOption[]>([])

const columns = [
  {
    title: 'Клиент',
    dataIndex: 'username',
    key: 'username',
  },
  {
    title: 'Деклараций',
    dataIndex: 'declarationCount',
    key: 'declarationCount',
    width: 140,
    align: 'center' as const,
    sorter: (a: ReestrClientOption, b: ReestrClientOption) =>
      a.declarationCount - b.declarationCount,
    defaultSortOrder: 'descend' as const,
  },
]

const getInitial = (username: string): string =>
  (username || '?').charAt(0).toUpperCase()

onMounted(async () => {
  loading.value = true
  try {
    clients.value = await reestrApi.listPortfolioClients()
  } catch {
    clients.value = []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.clients-view {
  margin: 0 auto;
}

.client-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.client-avatar {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--atg-surface-muted);
  border: 1px solid var(--atg-line-strong);
  color: var(--atg-charcoal);
  font-size: 13px;
  font-weight: 750;
}

.declaration-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--atg-accent-soft);
  border: 1px solid rgba(200, 149, 53, 0.25);
  color: var(--atg-accent-strong);
  font-size: 13px;
  font-weight: 750;
}

.declaration-count.count-zero {
  background: var(--atg-surface-muted);
  border-color: var(--atg-line);
  color: var(--atg-muted);
  font-weight: 600;
}
</style>
