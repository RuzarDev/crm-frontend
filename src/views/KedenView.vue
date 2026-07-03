<template>
  <div v-if="declaration" class="keden-page crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">ИС «KEDEN» · Декларация</div>
        <h1 class="crm-page-title">{{ declaration.registrationNumber || declaration.kedenId }}</h1>
        <p class="crm-page-subtitle">{{ typeLabel }}</p>
      </div>
      <div class="crm-page-actions">
        <a-button @click="router.push('/keden')"><LeftOutlined /> К списку</a-button>
        <a-button :loading="loading" @click="reload"><ReloadOutlined /> Обновить</a-button>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="status-row">
        <span class="status-chip" :class="statusClass">{{ declaration.statusName || '—' }}</span>
        <span class="synced-note">Синхронизировано: {{ formatDate(declaration.syncedAtUtc) }}</span>
      </div>

      <div class="meta-grid">
        <div class="meta-item"><span>Номер декларации</span><strong>{{ declaration.registrationNumber || '—' }}</strong></div>
        <div class="meta-item"><span>ID в KEDEN</span><strong>{{ declaration.kedenId }}</strong></div>
        <div class="meta-item"><span>Тип</span><strong>{{ typeLabel }}</strong></div>
        <div class="meta-item"><span>Референс-код</span><strong>{{ declaration.referenceCode || '—' }}</strong></div>
        <div class="meta-item"><span>Декларант</span><strong>{{ declaration.declarantName || '—' }}</strong></div>
        <div class="meta-item"><span>БИН/ИИН декларанта</span><strong>{{ declaration.declarantXin || '—' }}</strong></div>
        <div class="meta-item"><span>Таможенный пост</span><strong>{{ declaration.customsPost || '—' }}</strong></div>
        <div class="meta-item"><span>Дата регистрации</span><strong>{{ formatDate(declaration.registeredDateTimeUtc) }}</strong></div>
        <div class="meta-item"><span>Дата статуса</span><strong>{{ formatDate(declaration.statusDateTimeUtc) }}</strong></div>
      </div>
    </a-card>

    <a-card class="crm-shell-card" :bordered="false">
      <template #title>Полные данные из KEDEN</template>
      <pre class="raw-json">{{ rawJson }}</pre>
    </a-card>
  </div>
  <a-spin v-else-if="loading" class="page-spin" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { kedenApi, KEDEN_DECLARATION_TYPES, type KedenDeclarationDetailDto } from '@/api/keden'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const declaration = ref<KedenDeclarationDetailDto | null>(null)

const typeLabel = computed(
  () => KEDEN_DECLARATION_TYPES.find((t) => t.key === declaration.value?.declarationType)?.label
    || declaration.value?.declarationType
    || '',
)

const statusClass = computed(() => {
  switch (declaration.value?.statusCode) {
    case 'ACCEPTED':
    case 'RELEASED':
      return 'status-ok'
    case 'DRAFT':
      return 'status-draft'
    default:
      return ''
  }
})

const rawJson = computed(() => JSON.stringify(declaration.value?.raw ?? {}, null, 2))

const formatDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : '—')

const reload = async () => {
  loading.value = true
  try {
    declaration.value = await kedenApi.get(route.params.id as string)
  } finally {
    loading.value = false
  }
}

onMounted(() => void reload())
</script>

<style scoped>
.keden-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.status-chip {
  display: inline-flex;
  border-radius: 999px;
  background: var(--atg-teal-soft);
  color: var(--atg-accent-strong);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
}

.status-chip.status-ok {
  background: rgba(43, 188, 148, 0.12);
  color: #1f8f6f;
}

.status-chip.status-draft {
  background: rgba(160, 160, 160, 0.15);
  color: #6b6b6b;
}

.synced-note {
  color: var(--atg-muted);
  font-size: 12.5px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item span {
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.meta-item strong {
  color: var(--atg-ink);
  font-size: 14.5px;
  font-weight: 700;
}

.raw-json {
  max-height: 480px;
  overflow: auto;
  background: var(--atg-surface-alt, #f7f7f7);
  border-radius: var(--atg-radius-lg);
  padding: 16px;
  font-size: 12.5px;
  line-height: 1.5;
}

.page-spin {
  display: flex;
  justify-content: center;
  margin-top: 60px;
}

@media (max-width: 900px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
