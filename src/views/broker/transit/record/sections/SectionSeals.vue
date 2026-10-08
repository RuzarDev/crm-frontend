<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ReestrIdentificationMeansInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import { useRecordRefs } from './refs'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Пломбы» (разбор §2.6 f): средства идентификации. «Без пломбы» отключает остальные поля и при включении
// ОЧИЩАЕТ их — иначе скрытые значения ушли бы на сервер.
defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.seals.${key}`)

const refs = useRecordRefs()
void refs.ensureClassifiers(['identification-means'])
const typeOptions = computed(() => refs.classifierOptions('identification-means'))
const cards = ref<{ add: () => void } | null>(null)
const newSeal = (): ReestrIdentificationMeansInput => ({ noSeal: false, meansTypeCode: null, quantity: null, number: null })

function setNoSeal(row: ReestrIdentificationMeansInput, on: boolean) {
  row.noSeal = on
  if (on) {
    row.meansTypeCode = null
    row.quantity = null
    row.number = null
  }
}
</script>

<template>
  <RecordSection id="seals" :title="t('broker.transitRecord.sections.seals')" :count="draft.identificationMeans.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="tr('add')" @click="cards?.add()" />
    </template>
    <RepeatCards ref="cards" :items="draft.identificationMeans" :readonly="readonly" :empty-text="tr('empty')" :new-item="newSeal">
      <template #item="{ item }">
        <div class="flex flex-col gap-3">
          <ZCheckbox :checked="item.noSeal" :disabled="readonly" class="max-sm:min-h-11" data-f="noSeal" @update:checked="setNoSeal(item, $event)">{{ tr('noSeal') }}</ZCheckbox>
          <div :class="grid">
            <ZField :label="tr('type')">
              <ZSelect :value="item.meansTypeCode" :options="typeOptions" show-search allow-clear :disabled="readonly || item.noSeal" :placeholder="t('broker.transitRecord.parties.choose')" :class="boxCtl" data-f="meansTypeCode" @update:value="item.meansTypeCode = str($event)" />
            </ZField>
            <ZField :label="tr('quantity')">
              <ZNumber :value="item.quantity" :min="0" :disabled="readonly || item.noSeal" :class="ctl" data-f="quantity" @update:value="item.quantity = $event" />
            </ZField>
            <ZField :label="tr('number')">
              <ZInput :value="item.number" mono :maxlength="128" :disabled="readonly || item.noSeal" :class="ctl" data-f="number" @update:value="item.number = str($event)" />
            </ZField>
          </div>
        </div>
      </template>
    </RepeatCards>
  </RecordSection>
</template>
