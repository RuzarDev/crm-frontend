<template>
  <div class="crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Справочники</div>
        <h1 class="crm-page-title">Порядок заполнения ДТ</h1>
      </div>
    </div>

    <a-alert
      type="info"
      show-icon
      message="Решение Комиссии Таможенного союза от 20.05.2010 № 257 — Порядок заполнения декларации на товары"
      class="dt-guide-note"
    />

    <a-input-search v-model:value="query" placeholder="Поиск по графам и тексту" allow-clear class="dt-guide-search" />

    <a-spin :spinning="loading">
      <a-row :gutter="24">
        <a-col :span="6">
          <a-menu v-model:selectedKeys="selectedKeys" mode="inline" class="dt-guide-menu">
            <a-menu-item v-for="e in filtered" :key="e.graph">Гр.{{ e.graph }} · {{ e.title }}</a-menu-item>
          </a-menu>
        </a-col>
        <a-col :span="18">
          <a-card v-if="current" :title="`Графа ${current.graph} — ${current.title}`">
            <!-- Текст нормативного акта, санитайзится при парсинге на сервере. -->
            <div class="dt-guide-body" v-html="current.html" />
          </a-card>
          <a-empty v-else description="Выберите графу слева" />
        </a-col>
      </a-row>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { referencesApi } from '@/api/references'
import type { DtGuideEntry } from '@/types/api'

const entries = ref<DtGuideEntry[]>([])
const loading = ref(false)
const query = ref('')
const selectedKeys = ref<string[]>([])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return entries.value
  return entries.value.filter(
    (e) => e.graph.includes(q) || e.title.toLowerCase().includes(q) || e.html.toLowerCase().includes(q),
  )
})

const current = computed(() => entries.value.find((e) => e.graph === selectedKeys.value[0]) ?? null)

onMounted(async () => {
  loading.value = true
  try {
    entries.value = await referencesApi.getDtGuide()
    if (entries.value.length) selectedKeys.value = [entries.value[0].graph]
  } catch {
    message.error('Не удалось загрузить справочник')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dt-guide-note {
  margin-bottom: 16px;
}
.dt-guide-search {
  margin-bottom: 16px;
  max-width: 420px;
}
.dt-guide-menu {
  max-height: 70vh;
  overflow-y: auto;
}
.dt-guide-body {
  font-size: 14px;
  line-height: 1.7;
  max-height: 70vh;
  overflow-y: auto;
}
</style>
