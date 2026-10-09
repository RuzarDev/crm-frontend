<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import NonTariffMeasureGroups from '@/components/NonTariffMeasureGroups.vue'
import TnvedTabStatus from './TnvedTabStatus.vue'
import type { TnvedReferenceDto } from '@/types/api'
import type { Loaded } from './tnvedPage'

// Вкладка «Нетарифные меры» (справка по коду, ввоз): меры группами по виду документа.
// 404 — справка ещё не загружена синхронизацией; success:false — текст сервера.
defineProps<{ state?: Loaded<TnvedReferenceDto> }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div data-tnved-measures>
    <div v-if="!state || state.status === 'loading'" class="flex flex-col gap-2.5" aria-busy="true">
      <ZSkeleton v-for="i in 3" :key="i" height="40px" />
    </div>
    <p v-else-if="state.status === 'missing' || (state.status === 'done' && !state.data)" class="m-0 text-sm text-ink-3" data-measures-missing>
      {{ t('broker.references.tnved.measures.missing') }}
    </p>
    <TnvedTabStatus v-else-if="state.status !== 'done'" :status="state.status" @retry="emit('retry')" />
    <p v-else-if="!state.data!.success" class="m-0 text-sm text-ink-3" data-measures-nodata>
      {{ state.data!.errorMessage || t('broker.references.tnved.measures.noData') }}
    </p>
    <NonTariffMeasureGroups v-else-if="state.data!.nonTariffMeasures?.length" :measures="state.data!.nonTariffMeasures" />
    <p v-else class="m-0 text-sm text-ink-3" data-measures-empty>{{ t('broker.references.tnved.measures.empty') }}</p>
  </div>
</template>
