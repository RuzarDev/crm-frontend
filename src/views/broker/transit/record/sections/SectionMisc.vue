<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ReestrCargoOperationInput, ReestrTransitFields } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import { useLocalOptions } from './localOptions'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Прочее» (разбор §2.6 k, KEDEN §8–12): место временного хранения, пункт назначения, лицо, представившее ПИ
// (тип, БИН, наименование) и повторяющиеся грузовые операции.
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.misc.${key}`)

type StringKey = { [K in keyof ReestrTransitFields]: ReestrTransitFields[K] extends string | null ? K : never }[keyof ReestrTransitFields]
const setStr = (key: StringKey, v: unknown) => { props.draft.transit[key] = str(v) }

const { subjectTypes, cargoOperations } = useLocalOptions()
const cards = ref<{ add: () => void } | null>(null)
const newOperation = (): ReestrCargoOperationInput => ({ operationTypeCode: null })
const groupTitle = 'm-0 text-[13px] leading-5 font-semibold text-ink-2'
</script>

<template>
  <RecordSection id="misc" :title="t('broker.transitRecord.sections.misc')">
    <div class="flex flex-col gap-6">
      <div role="group" aria-labelledby="misc-g-storage" class="flex flex-col gap-3" data-misc-group="storage">
        <h3 id="misc-g-storage" :class="groupTitle">{{ tr('tempStorage') }}</h3>
        <div :class="grid">
          <ZField :label="tr('tempStoragePlace')" class="sm:col-span-2">
            <ZInput :value="draft.transit.tempStoragePlace" :maxlength="256" :disabled="readonly" :class="ctl" data-f="tempStoragePlace" @update:value="setStr('tempStoragePlace', $event)" />
          </ZField>
        </div>
      </div>

      <div role="group" aria-labelledby="misc-g-destination" class="flex flex-col gap-3" data-misc-group="destination">
        <h3 id="misc-g-destination" :class="groupTitle">{{ tr('destination') }}</h3>
        <div :class="grid">
          <ZField :label="tr('destinationPlace')" class="sm:col-span-2">
            <ZInput :value="draft.transit.destinationPlace" :maxlength="256" :disabled="readonly" :class="ctl" data-f="destinationPlace" @update:value="setStr('destinationPlace', $event)" />
          </ZField>
        </div>
      </div>

      <div role="group" aria-labelledby="misc-g-submitter" class="flex flex-col gap-3" data-misc-group="submitter">
        <h3 id="misc-g-submitter" :class="groupTitle">{{ tr('submitter') }}</h3>
        <div :class="grid">
          <ZField :label="t('broker.transitRecord.parties.subjectType')">
            <ZSelect :value="draft.transit.submitterType" :options="subjectTypes" allow-clear :disabled="readonly" :placeholder="t('broker.transitRecord.parties.choose')" :class="boxCtl" data-f="submitterType" @update:value="setStr('submitterType', $event)" />
          </ZField>
          <ZField :label="t('broker.transitRecord.parties.bin')">
            <ZInput :value="draft.transit.submitterBin" mono :maxlength="32" :disabled="readonly" :class="ctl" data-f="submitterBin" @update:value="setStr('submitterBin', $event)" />
          </ZField>
          <ZField :label="t('broker.transitRecord.parties.name')" class="sm:col-span-2 lg:col-span-1">
            <ZInput :value="draft.transit.submitterName" :maxlength="500" :disabled="readonly" :class="ctl" data-f="submitterName" @update:value="setStr('submitterName', $event)" />
          </ZField>
        </div>
      </div>

      <div role="group" aria-labelledby="misc-g-ops" class="flex flex-col gap-3" data-misc-group="operations">
        <div class="flex flex-wrap items-center gap-2.5">
          <h3 id="misc-g-ops" class="m-0 text-[13px] leading-5 font-semibold text-ink-2">{{ tr('operations') }}</h3>
          <span class="rounded-pill bg-sunken px-1.5 text-xs font-normal text-ink-2 tabular-nums" data-ops-count>{{ draft.cargoOperations.length }}</span>
          <SectionAddButton v-if="!readonly" class="ml-auto" :label="tr('addOperation')" @click="cards?.add()" />
        </div>
        <RepeatCards ref="cards" inline :items="draft.cargoOperations" :readonly="readonly" :empty-text="tr('noOperations')" :new-item="newOperation">
          <template #item="{ item }">
            <ZField :label="tr('operationType')">
              <ZSelect :value="item.operationTypeCode" :options="cargoOperations" allow-clear :disabled="readonly" :placeholder="t('broker.transitRecord.parties.choose')" :class="boxCtl" data-f="operationTypeCode" @update:value="item.operationTypeCode = str($event)" />
            </ZField>
          </template>
        </RepeatCards>
      </div>
    </div>
  </RecordSection>
</template>
