<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ReestrPackageInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import { useRecordRefs } from './refs'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Упаковка» (разбор §2.6 g): сверху скаляр «Сведения об упаковке» (transit.packagingInfoCode),
// ниже строки — вид сведений, тип упаковки (2013), количество, описание.
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.packaging.${key}`)

const refs = useRecordRefs()
void refs.ensureClassifiers(['packaging-info', 'packaging-info-kind', '2013'])
const infoOptions = computed(() => refs.classifierOptions('packaging-info'))
const kindOptions = computed(() => refs.classifierOptions('packaging-info-kind'))
const typeOptions = computed(() => refs.classifierOptions('2013'))
const cards = ref<{ add: () => void } | null>(null)
const newPackage = (): ReestrPackageInput => ({ packagingInfoKindCode: null, packageTypeCode: null, packageCount: null, description: null })
const choose = t('broker.transitRecord.parties.choose')
</script>

<template>
  <RecordSection id="packaging" :title="t('broker.transitRecord.sections.packaging')" :count="draft.packages.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="tr('add')" @click="cards?.add()" />
    </template>
    <div class="flex flex-col gap-4">
      <div :class="grid">
        <ZField :label="tr('info')">
          <ZSelect :value="draft.transit.packagingInfoCode" :options="infoOptions" show-search allow-clear :disabled="readonly" :placeholder="choose" :class="boxCtl" data-f="packagingInfoCode" @update:value="props.draft.transit.packagingInfoCode = str($event)" />
        </ZField>
      </div>
      <RepeatCards ref="cards" :items="draft.packages" :readonly="readonly" :empty-text="tr('empty')" :new-item="newPackage">
        <template #item="{ item }">
          <div :class="grid">
            <ZField :label="tr('kind')">
              <ZSelect :value="item.packagingInfoKindCode" :options="kindOptions" show-search allow-clear :disabled="readonly" :placeholder="choose" :class="boxCtl" data-f="packagingInfoKindCode" @update:value="item.packagingInfoKindCode = str($event)" />
            </ZField>
            <ZField :label="tr('type')">
              <ZSelect :value="item.packageTypeCode" :options="typeOptions" show-search allow-clear :disabled="readonly" :placeholder="choose" :class="boxCtl" data-f="packageTypeCode" @update:value="item.packageTypeCode = str($event)" />
            </ZField>
            <ZField :label="tr('count')">
              <ZNumber :value="item.packageCount" :min="0" :disabled="readonly" :class="ctl" data-f="packageCount" @update:value="item.packageCount = $event" />
            </ZField>
            <ZField :label="tr('description')" class="sm:col-span-2 lg:col-span-3">
              <ZInput :value="item.description" :maxlength="1000" :disabled="readonly" :class="ctl" data-f="description" @update:value="item.description = str($event)" />
            </ZField>
          </div>
        </template>
      </RepeatCards>
    </div>
  </RecordSection>
</template>
