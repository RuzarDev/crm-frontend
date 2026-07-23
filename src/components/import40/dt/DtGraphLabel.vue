<template>
  <span class="dt-graph-label">
    <span class="dt-graph-num">Гр.{{ graph }}</span>
    <span class="dt-graph-text">{{ text }}</span>
    <a-popover trigger="click" placement="rightTop" :overlay-style="{ maxWidth: '520px' }" @open-change="onOpenChange">
      <template #title>
        <span>Графа {{ graph }}{{ entry?.title ? ` — ${entry.title}` : '' }}</span>
      </template>
      <template #content>
        <a-spin v-if="loading" />
        <div v-else-if="error" class="dt-guide-error">{{ error }}</div>
        <!-- Текст нормативного акта из КТС 257: источник доверенный, санитайзится при парсинге на сервере. -->
        <div v-else class="dt-guide-body" v-html="entry?.html" />
      </template>
      <QuestionCircleOutlined class="dt-graph-help" />
    </a-popover>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
import { referencesApi } from '@/api/references'
import type { DtGuideEntry } from '@/types/api'

const props = defineProps<{ graph: string; text: string }>()

const entry = ref<DtGuideEntry | null>(null)
const loading = ref(false)
const error = ref('')

// Текст графы грузится лениво при первом открытии и потом переиспользуется.
const onOpenChange = async (open: boolean) => {
  if (!open || entry.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    entry.value = await referencesApi.getDtGuideGraph(props.graph)
  } catch {
    error.value = 'Порядок заполнения для этой графы не найден'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.dt-graph-label {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.dt-graph-num {
  font-variant-numeric: tabular-nums;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
}
.dt-graph-help {
  color: rgba(0, 0, 0, 0.35);
  cursor: pointer;
  font-size: 12px;
}
.dt-graph-help:hover {
  color: #1677ff;
}
.dt-guide-body {
  max-height: 420px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
}
/* В КТС 257 есть иллюстрации шире поповера (до 534px) — ужимаем по ширине. */
.dt-guide-body :deep(img),
.dt-guide-body :deep(table) {
  max-width: 100%;
  height: auto;
}
.dt-guide-error {
  color: rgba(0, 0, 0, 0.45);
}
</style>
