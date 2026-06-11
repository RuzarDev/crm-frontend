<template>
  <div class="tnved-news-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">ТН ВЭД ЕАЭС</div>
        <h1 class="crm-page-title">Новости</h1>
        <p class="crm-page-subtitle">Актуальные новости таможенного регулирования.</p>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="toolbar">
        <a-input-search
          v-model:value="filterQuery"
          placeholder="Поиск по заголовку…"
          allow-clear
          style="max-width:360px"
        />
        <a-checkbox v-model:checked="onlyImportant" style="margin-left:12px">Только важные</a-checkbox>
      </div>

      <a-spin :spinning="loading">
        <div v-if="!loading && filtered.length === 0" class="empty-hint">Нет новостей</div>

        <div class="news-list">
          <div v-for="item in filtered" :key="item.url + item.title" class="news-item" :class="{ important: item.isImportant }">
            <div class="news-meta">
              <a-tag :color="typeColor(item.publicationType)" style="font-size:11px">{{ item.publicationType }}</a-tag>
              <a-tag v-if="item.isImportant" color="red" style="font-size:11px">Важно</a-tag>
              <span class="news-date">{{ fmtDate(item.itemDate) }}</span>
            </div>
            <a class="news-title" :href="item.url" target="_blank" rel="noopener">{{ item.title }}</a>
          </div>
        </div>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNewsDto } from '@/types/api'

const news = ref<TnvedNewsDto[]>([])
const loading = ref(false)
const filterQuery = ref('')
const onlyImportant = ref(false)

const filtered = computed(() => {
  let list = news.value
  if (onlyImportant.value) list = list.filter(n => n.isImportant)
  if (filterQuery.value.trim()) {
    const q = filterQuery.value.toLowerCase()
    list = list.filter(n => n.title.toLowerCase().includes(q))
  }
  return list
})

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function typeColor(t: string) {
  if (t?.toLowerCase().includes('важн')) return 'red'
  if (t?.toLowerCase().includes('закон')) return 'blue'
  if (t?.toLowerCase().includes('нов')) return 'green'
  return 'default'
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await tnvedApi.news(100)
    news.value = data
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
  gap: 4px;
}

.news-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.news-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--atg-line);
}

.news-item:last-child { border-bottom: none; }

.news-item.important { background: rgba(255, 77, 79, 0.03); padding-left: 8px; border-left: 3px solid #ff4d4f; }

.news-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.news-date {
  font-size: 11px;
  color: var(--atg-muted);
  margin-left: auto;
}

.news-title {
  font-size: 14px;
  color: var(--atg-accent-strong);
  font-weight: 500;
  line-height: 1.4;
}

.news-title:hover { text-decoration: underline; }

.empty-hint {
  color: var(--atg-muted);
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
}
</style>
