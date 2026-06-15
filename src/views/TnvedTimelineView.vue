<template>
  <div class="tnved-timeline-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">ТН ВЭД ЕАЭС</div>
        <h1 class="crm-page-title">Таймлайн изменений</h1>
        <p class="crm-page-subtitle">История изменений ставок и классификатора.</p>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-spin :spinning="loading">
        <div v-if="!loading && items.length === 0" class="empty-hint">Записей не найдено</div>

        <a-timeline v-else mode="left">
          <a-timeline-item
            v-for="(item, i) in items"
            :key="i"
            :color="typeColor(item.typeId)"
          >
            <template #label>
              <span class="tl-date">{{ fmtDate(item.showDate) }}</span>
            </template>
            <span class="tl-desc">{{ item.description }}</span>
          </a-timeline-item>
        </a-timeline>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedTimelineDto } from '@/types/api'

const items = ref<TnvedTimelineDto[]>([])
const loading = ref(false)

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function typeColor(typeId: number) {
  switch (typeId) {
    case 1: return 'blue'
    case 2: return 'green'
    case 3: return 'orange'
    case 4: return 'red'
    default: return 'gray'
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await tnvedApi.timeline(80)
    items.value = data
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.tl-date {
  font-size: 12px;
  color: var(--atg-muted);
  white-space: nowrap;
}
.tl-desc {
  font-size: 13px;
  color: var(--atg-text);
}
.empty-hint {
  color: var(--atg-muted);
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
}
</style>
