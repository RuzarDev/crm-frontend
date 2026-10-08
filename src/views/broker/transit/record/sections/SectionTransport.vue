<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ReestrTransportMeansInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import { useRecordRefs } from './refs'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Транспорт» (разбор §2.6 e): транспортные средства на границе. Классификаторы: transport-mode,
// transport-purpose, 2024 (тип ТС); номер вагона / контейнера — моно; четыре флажка.
defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.transport.${key}`)

const refs = useRecordRefs()
void refs.ensureClassifiers(['transport-mode', 'transport-purpose', '2024'])
const modeOptions = computed(() => refs.classifierOptions('transport-mode'))
const purposeOptions = computed(() => refs.classifierOptions('transport-purpose'))
const vehicleOptions = computed(() => refs.classifierOptions('2024'))
const cards = ref<{ add: () => void } | null>(null)
const newVehicle = (): ReestrTransportMeansInput => ({
  transportModeCode: null, purposeCode: null, vehicleTypeCode: null, wagonOrContainerNumber: null,
  isEmpty: false, isWagonReturn: false, inContainer: false, matchesTransitVehicle: false,
})
const FLAGS = [
  ['isEmpty', 'flagEmpty'], ['isWagonReturn', 'flagReturn'], ['inContainer', 'flagInContainer'], ['matchesTransitVehicle', 'flagMatches'],
] as const
const check = 'max-sm:min-h-11'
</script>

<template>
  <RecordSection id="transport" :title="t('broker.transitRecord.sections.transport')" :count="draft.transportMeans.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="tr('add')" @click="cards?.add()" />
    </template>
    <RepeatCards ref="cards" :items="draft.transportMeans" :readonly="readonly" :empty-text="tr('empty')" :new-item="newVehicle">
      <template #item="{ item }">
        <div class="flex flex-col gap-3">
          <div :class="grid">
            <ZField :label="tr('mode')">
              <ZSelect :value="item.transportModeCode" :options="modeOptions" show-search allow-clear :disabled="readonly" :placeholder="t('broker.transitRecord.parties.choose')" :class="boxCtl" data-f="transportModeCode" @update:value="item.transportModeCode = str($event)" />
            </ZField>
            <ZField :label="tr('purpose')">
              <ZSelect :value="item.purposeCode" :options="purposeOptions" show-search allow-clear :disabled="readonly" :placeholder="t('broker.transitRecord.parties.choose')" :class="boxCtl" data-f="purposeCode" @update:value="item.purposeCode = str($event)" />
            </ZField>
            <ZField :label="tr('vehicleType')">
              <ZSelect :value="item.vehicleTypeCode" :options="vehicleOptions" show-search allow-clear :disabled="readonly" :placeholder="t('broker.transitRecord.parties.choose')" :class="boxCtl" data-f="vehicleTypeCode" @update:value="item.vehicleTypeCode = str($event)" />
            </ZField>
            <ZField :label="tr('number')">
              <ZInput :value="item.wagonOrContainerNumber" mono :maxlength="64" :disabled="readonly" :class="ctl" data-f="wagonOrContainerNumber" @update:value="item.wagonOrContainerNumber = str($event)" />
            </ZField>
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-1 max-sm:flex-col">
            <ZCheckbox v-for="[key, label] in FLAGS" :key="key" :checked="item[key]" :disabled="readonly" :class="check" :data-f="key" @update:checked="item[key] = $event">{{ tr(label) }}</ZCheckbox>
          </div>
        </div>
      </template>
    </RepeatCards>
  </RecordSection>
</template>
