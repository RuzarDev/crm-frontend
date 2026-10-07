<template>
  <div class="crm-page">
    <PageHeader :kicker="t('sales.spravochniki')" :title="t('sales.poryadokZapolneniyaDt')" />

    <a-alert
      type="info"
      show-icon
      :message="t('misc.reshenie257')"
      class="dt-guide-note"
    />

    <a-input-search v-model:value="query" :placeholder="t('sales.poiskPoGrafamI')" allow-clear class="dt-guide-search" />

    <a-spin :spinning="loading">
      <a-row :gutter="24">
        <a-col :span="6">
          <a-menu v-model:selectedKeys="selectedKeys" mode="inline" class="dt-guide-menu">
            <a-menu-item v-for="e in filtered" :key="e.graph">{{ t('sales.grN', { n: e.graph }) }} · {{ e.title }}</a-menu-item>
          </a-menu>
        </a-col>
        <a-col :span="18">
          <a-card v-if="current" class="dt-guide-content" :title="t('misc.grafaTitle', { n: current.graph, t: current.title })">
            <!-- Текст нормативного акта, санитайзится при парсинге на сервере. -->
            <div class="dt-guide-body" v-html="current.html" />
          </a-card>
          <a-empty v-else :description="t('sales.vyberiteGrafuSleva')" />
        </a-col>
      </a-row>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, computed, onMounted } from 'vue'
import { message } from '@/ui/message'
import { referencesApi } from '@/api/references'
import type { DtGuideEntry } from '@/types/api'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

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
    message.error(t('sales.neUdalosZagruzitSpravochnik'))
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
/* Панель контента графы: комфортная ширина чтения — норм.текст графы обычно
   короткий (2-3 строки), а колонка span=18 ~1000px создавала ощущение пустой
   недовёрстанной панели. Ограничиваем и прижимаем влево. */
.dt-guide-content {
  max-width: 820px;
}
.dt-guide-body {
  font-size: 14px;
  line-height: 1.7;
  max-height: 70vh;
  overflow-y: auto;
}
.dt-guide-body :deep(img),
.dt-guide-body :deep(table) {
  max-width: 100%;
  height: auto;
}
</style>
