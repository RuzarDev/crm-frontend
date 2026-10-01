<template>
  <div v-if="declaration" class="keden-page crm-page">
    <PageHeader
      :kicker="t('transit.isKedenDeklaraciya')"
      :title="declaration.registrationNumber || declaration.kedenId"
      :subtitle="typeLabel"
    >
      <template #actions>
        <a-button @click="router.push('/keden')"><LeftOutlined /> {{ t('transit.kSpisku') }}</a-button>
        <a-button :loading="loading" @click="reload"><ReloadOutlined /> {{ t('transit.obnovit') }}</a-button>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="status-row">
        <span class="status-chip" :class="statusClass">{{ declaration.statusName || '—' }}</span>
        <span class="synced-note">{{ t('transit.sinhronizirovano', { date: formatDate(declaration.syncedAtUtc) }) }}</span>
      </div>

      <div class="meta-grid">
        <div class="meta-item"><span>{{ t('transit.nomerDeklaracii') }}</span><strong>{{ declaration.registrationNumber || '—' }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.idVKeden') }}</span><strong>{{ declaration.kedenId }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.tip') }}</span><strong>{{ typeLabel }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.referensKod') }}</span><strong>{{ declaration.referenceCode || '—' }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.deklarant') }}</span><strong>{{ declaration.declarantName || '—' }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.binIinDeklaranta') }}</span><strong>{{ declaration.declarantXin || '—' }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.tamozhennyyPost') }}</span><strong>{{ declaration.customsPost || '—' }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.dataRegistracii') }}</span><strong>{{ formatDate(declaration.registeredDateTimeUtc) }}</strong></div>
        <div class="meta-item"><span>{{ t('transit.dataStatusa') }}</span><strong>{{ formatDate(declaration.statusDateTimeUtc) }}</strong></div>
      </div>
    </a-card>

    <a-card class="crm-shell-card" :bordered="false">
      <template #title>{{ t('transit.polnyeDannyeIzKeden') }}</template>
      <pre class="raw-json">{{ rawJson }}</pre>
    </a-card>
  </div>
  <a-spin v-else-if="loading" class="page-spin" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { kedenApi, KEDEN_DECLARATION_TYPES, type KedenDeclarationDetailDto } from '@/api/keden'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

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
  background: var(--z-teal-soft);
  color: var(--z-teal-d);
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
  color: var(--z-muted);
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
  color: var(--z-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.meta-item strong {
  color: var(--z-ink);
  font-size: 14.5px;
  font-weight: 700;
}

.raw-json {
  max-height: 480px;
  overflow: auto;
  background: var(--z-surface-2);
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
