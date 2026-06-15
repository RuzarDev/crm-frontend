<template>
  <div class="system-endpoints-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Система</div>
        <h1 class="crm-page-title">Каталог API</h1>
        <p class="crm-page-subtitle">Все маршруты REST API сервера — методы, политики авторизации и анонимный доступ.</p>
      </div>
      <div class="crm-page-actions">
        <a-input-search
          v-model:value="search"
          placeholder="Поиск по маршруту…"
          style="width: 280px"
          allow-clear
        />
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-spin :spinning="loading">
        <a-table
          :data-source="filteredEndpoints"
          :columns="columns"
          :pagination="{ pageSize: 30, showSizeChanger: false }"
          size="small"
          row-key="route"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'methods'">
              <a-space :size="4" wrap>
                <a-tag
                  v-for="m in record.methods"
                  :key="m"
                  :color="methodColor(m)"
                  style="font-size:11px;font-weight:700;margin:0"
                >{{ m }}</a-tag>
              </a-space>
            </template>
            <template v-else-if="column.key === 'access'">
              <a-tag v-if="record.allowsAnonymous" color="default" style="font-size:11px">Анонимный</a-tag>
              <a-space v-else :size="4" wrap>
                <a-tag
                  v-for="p in record.policies"
                  :key="p"
                  color="blue"
                  style="font-size:11px;margin:0"
                >{{ p }}</a-tag>
                <a-tag v-if="!record.policies.length" color="orange" style="font-size:11px">Авторизован</a-tag>
              </a-space>
            </template>
            <template v-else-if="column.key === 'route'">
              <span class="route-cell">{{ record.route }}</span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { systemApi } from '@/api/system'
import type { EndpointRow } from '@/types/api'

const endpoints = ref<EndpointRow[]>([])
const loading = ref(false)
const search = ref('')

const columns = [
  { title: 'Маршрут', key: 'route', dataIndex: 'route', ellipsis: true },
  { title: 'Методы', key: 'methods', width: 130 },
  { title: 'Доступ', key: 'access', width: 260 },
]

const filteredEndpoints = computed(() => {
  if (!search.value.trim()) return endpoints.value
  const q = search.value.trim().toLowerCase()
  return endpoints.value.filter(
    (e) =>
      e.route.toLowerCase().includes(q) ||
      e.policies.some((p) => p?.toLowerCase().includes(q)),
  )
})

function methodColor(method: string): string {
  const m = method.toUpperCase()
  if (m === 'GET') return 'green'
  if (m === 'POST') return 'blue'
  if (m === 'PUT') return 'orange'
  if (m === 'PATCH') return 'cyan'
  if (m === 'DELETE') return 'red'
  return 'default'
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await systemApi.getEndpoints()
    endpoints.value = data
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.route-cell {
  font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
  font-size: 12px;
  color: var(--atg-ink);
}
</style>
