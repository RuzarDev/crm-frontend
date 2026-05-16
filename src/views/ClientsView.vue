<template>
  <div class="clients-view">
    <a-card title="Клиенты" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="clients"
        :loading="loading"
        :pagination="false"
        row-key="id"
      />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { reestrApi } from '@/api/reestr'
import type { ReestrClientOption } from '@/types/api'

const loading = ref(false)
const clients = ref<ReestrClientOption[]>([])

const columns = [
  {
    title: 'Логин',
    dataIndex: 'username',
    key: 'username',
  },
  {
    title: 'Деклараций',
    dataIndex: 'declarationCount',
    key: 'declarationCount',
    width: 140,
  },
]

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
  max-width: 900px;
  margin: 0 auto;
}
</style>
