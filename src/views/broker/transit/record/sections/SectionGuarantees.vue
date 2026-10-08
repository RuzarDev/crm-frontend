<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ReestrGuaranteeInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import { useLocalOptions } from './localOptions'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, ph, str } from './ui'

// Раздел «Гарантия» (разбор §2.6 j, KEDEN «Обеспечение»): вид, сумма, валюта (общий список), номер.
defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.guarantees.${key}`)

const { guaranteeTypes, currencies } = useLocalOptions()
const cards = ref<{ add: () => void } | null>(null)
const newGuarantee = (): ReestrGuaranteeInput => ({ guaranteeTypeCode: null, amount: null, currencyCode: null, number: null })
</script>

<template>
  <RecordSection id="guarantees" :title="t('broker.transitRecord.sections.guarantees')" :count="draft.guarantees.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="tr('add')" @click="cards?.add()" />
    </template>
    <RepeatCards ref="cards" :items="draft.guarantees" :readonly="readonly" :empty-text="tr('empty')" :new-item="newGuarantee">
      <template #item="{ item }">
        <div :class="grid">
          <ZField :label="tr('type')">
            <ZSelect :value="item.guaranteeTypeCode" :options="guaranteeTypes" allow-clear :disabled="readonly" :placeholder="ph(readonly, t('broker.transitRecord.parties.choose'))" :class="boxCtl" data-f="guaranteeTypeCode" @update:value="item.guaranteeTypeCode = str($event)" />
          </ZField>
          <ZField :label="tr('amount')">
            <ZNumber :value="item.amount" :min="0" :disabled="readonly" :class="ctl" data-f="amount" @update:value="item.amount = $event" />
          </ZField>
          <ZField :label="tr('currency')">
            <ZSelect :value="item.currencyCode" :options="currencies" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, t('broker.transitRecord.parties.choose'))" :class="boxCtl" data-f="currencyCode" @update:value="item.currencyCode = str($event)" />
          </ZField>
          <ZField :label="tr('number')">
            <ZInput :value="item.number" mono :maxlength="256" :disabled="readonly" :class="ctl" data-f="number" @update:value="item.number = str($event)" />
          </ZField>
        </div>
      </template>
    </RepeatCards>
  </RecordSection>
</template>
