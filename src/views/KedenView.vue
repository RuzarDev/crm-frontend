<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { PhArrowClockwise, PhCaretLeft } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDescriptions from '@/components/z/ZDescriptions.vue'
import ZDescriptionsItem from '@/components/z/ZDescriptionsItem.vue'
import ZPage from '@/components/z/ZPage.vue'
import ZPanel from '@/components/z/ZPanel.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import { kedenApi, KEDEN_DECLARATION_TYPES, type KedenDeclarationDetailDto } from '@/api/keden'

// Карточка декларации КЕДЕН (/keden/:id, администратор, редизайн, волна 7): реквизиты и сырые данные из КЕДЕН.
const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const failed = ref(false)
const declaration = ref<KedenDeclarationDetailDto | null>(null)

const typeLabel = computed(
  () => KEDEN_DECLARATION_TYPES.find((x) => x.key === declaration.value?.declarationType)?.label
    || declaration.value?.declarationType
    || '',
)

const statusTone = computed<ZTone>(() => {
  switch (declaration.value?.statusCode) {
    case 'ACCEPTED':
    case 'RELEASED':
      return 'done'
    case 'DRAFT':
      return 'neutral'
    default:
      return 'info'
  }
})

const rawJson = computed(() => JSON.stringify(declaration.value?.raw ?? {}, null, 2))

const formatDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : '—')

const reload = async () => {
  loading.value = true
  failed.value = false
  try {
    declaration.value = await kedenApi.get(route.params.id as string)
  } catch {
    // Карточка уже была на экране — остаётся как есть (ошибку покажет общий перехватчик); иначе — плашка с повтором.
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => void reload())

const BTN = 'max-sm:h-11'
</script>

<template>
  <ZPage
    v-if="declaration"
    :title="declaration.registrationNumber || declaration.kedenId"
    :subtitle="typeLabel"
    data-keden-card
  >
    <template #breadcrumbs>{{ t('transit.isKedenDeklaraciya') }}</template>
    <template #meta>
      <ZTag :tone="statusTone" data-keden-status>{{ declaration.statusName || '—' }}</ZTag>
    </template>
    <template #actions>
      <ZButton variant="ghost" :class="BTN" data-keden-back @click="router.push('/keden')">
        <template #icon><PhCaretLeft :size="16" aria-hidden="true" /></template>
        {{ t('transit.kSpisku') }}
      </ZButton>
      <ZButton :loading="loading" :class="BTN" data-keden-reload @click="reload">
        <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
        {{ t('transit.obnovit') }}
      </ZButton>
    </template>

    <ZPanel padding="lg">
      <p class="m-0 mb-5 text-xs text-muted" data-keden-synced>{{ t('transit.sinhronizirovano', { date: formatDate(declaration.syncedAtUtc) }) }}</p>
      <ZDescriptions :column="3">
        <ZDescriptionsItem :label="t('transit.nomerDeklaracii')">{{ declaration.registrationNumber || '—' }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.idVKeden')">{{ declaration.kedenId }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.tip')">{{ typeLabel }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.referensKod')">{{ declaration.referenceCode || '—' }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.deklarant')">{{ declaration.declarantName || '—' }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.binIinDeklaranta')">{{ declaration.declarantXin || '—' }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.tamozhennyyPost')">{{ declaration.customsPost || '—' }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.dataRegistracii')">{{ formatDate(declaration.registeredDateTimeUtc) }}</ZDescriptionsItem>
        <ZDescriptionsItem :label="t('transit.dataStatusa')">{{ formatDate(declaration.statusDateTimeUtc) }}</ZDescriptionsItem>
      </ZDescriptions>
    </ZPanel>

    <ZPanel :title="t('transit.polnyeDannyeIzKeden')">
      <pre class="m-0 max-h-[480px] overflow-auto rounded-row bg-sunken p-4 font-mono text-xs leading-normal text-ink" data-keden-raw>{{ rawJson }}</pre>
    </ZPanel>
  </ZPage>
  <ZPage v-else-if="failed && !loading" :title="String(route.params.id)" data-keden-failed>
    <template #breadcrumbs>{{ t('transit.isKedenDeklaraciya') }}</template>
    <template #actions>
      <ZButton variant="ghost" :class="BTN" data-keden-back @click="router.push('/keden')">
        <template #icon><PhCaretLeft :size="16" aria-hidden="true" /></template>
        {{ t('transit.kSpisku') }}
      </ZButton>
    </template>
    <div role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-keden-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-keden-retry @click="reload">{{ t('broker.list.retry') }}</ZButton>
    </div>
  </ZPage>
  <div v-else-if="loading" class="flex flex-col gap-5" aria-busy="true" data-keden-skeleton>
    <div class="flex flex-col gap-2">
      <ZSkeleton width="220px" height="24px" />
      <ZSkeleton width="140px" height="14px" />
    </div>
    <ZPanel padding="lg">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ZSkeleton v-for="i in 9" :key="i" width="70%" height="14px" />
      </div>
    </ZPanel>
    <ZPanel><ZSkeleton :lines="6" height="12px" /></ZPanel>
  </div>
</template>
