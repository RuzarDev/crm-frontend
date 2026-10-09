<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import NonTariffMeasureGroups from '@/components/NonTariffMeasureGroups.vue'
import TnvedTabStatus from './TnvedTabStatus.vue'
import type { TnvedExportReferenceDto } from '@/types/api'
import type { Loaded } from './tnvedPage'

// Вкладка «Экспорт» (вывоз): ставка вывозной пошлины и нетарифные меры при вывозе.
defineProps<{ state?: Loaded<TnvedExportReferenceDto> }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div data-tnved-export>
    <div v-if="!state || state.status === 'loading'" class="flex flex-col gap-2.5" aria-busy="true">
      <ZSkeleton height="48px" width="240px" />
      <ZSkeleton v-for="i in 2" :key="i" height="40px" />
    </div>
    <p v-else-if="state.status === 'missing' || (state.status === 'done' && !state.data)" class="m-0 text-sm text-ink-3" data-export-missing>
      {{ t('broker.references.tnved.export.missing') }}
    </p>
    <TnvedTabStatus v-else-if="state.status !== 'done'" :status="state.status" @retry="emit('retry')" />
    <p v-else-if="!state.data!.success" class="m-0 text-sm text-ink-3" data-export-nodata>
      {{ state.data!.errorMessage || t('broker.references.tnved.measures.noData') }}
    </p>
    <div v-else class="flex flex-col gap-4">
      <div v-if="state.data!.rateValue" class="inline-flex w-fit flex-col rounded-row bg-canvas px-4 py-3" data-export-rate>
        <span class="text-[12.5px] text-muted">{{ t('broker.references.tnved.export.rate') }}</span>
        <span class="mt-0.5 text-lg font-semibold tabular-nums text-ink">{{ state.data!.rateValue }}</span>
      </div>
      <section v-if="state.data!.nonTariffMeasures?.length" class="flex flex-col gap-2">
        <h4 class="m-0 text-sm font-semibold text-ink">{{ t('broker.references.tnved.export.measures') }}</h4>
        <NonTariffMeasureGroups :measures="state.data!.nonTariffMeasures" />
      </section>
      <p v-if="!state.data!.rateValue && !state.data!.nonTariffMeasures?.length" class="m-0 text-sm text-ink-3" data-export-empty>
        {{ t('broker.references.tnved.export.empty') }}
      </p>
    </div>
  </div>
</template>
