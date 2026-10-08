<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ReestrCarrierInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import { DEFAULT_CARRIER_ROLE, useLocalOptions } from './localOptions'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import { useRecordRefs } from './refs'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Перевозчики» (разбор §2.6 d): перевозчик / представитель при транзите. Страна — числовой код ОКСМ.
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
void props
const { t } = useI18n()
const tp = (key: string) => t(`broker.transitRecord.parties.${key}`)

const refs = useRecordRefs()
void refs.ensure('countries')
const { carrierRoles, subjectTypes } = useLocalOptions()
const cards = ref<{ add: () => void } | null>(null)
const newCarrier = (): ReestrCarrierInput => ({
  role: DEFAULT_CARRIER_ROLE, subjectType: null, bin: null, name: null, countryCode: null, phone: null, email: null,
})
</script>

<template>
  <RecordSection id="carriers" :title="t('broker.transitRecord.sections.carriers')" :count="draft.carriers.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="t('broker.transitRecord.carriers.add')" @click="cards?.add()" />
    </template>
    <RepeatCards ref="cards" :items="draft.carriers" :readonly="readonly" :empty-text="t('broker.transitRecord.carriers.empty')" :new-item="newCarrier">
      <template #item="{ item }">
        <div :class="grid">
          <ZField :label="tp('role')">
            <ZSelect :value="item.role" :options="carrierRoles" :disabled="readonly" :class="boxCtl" data-f="role" @update:value="item.role = str($event) ?? DEFAULT_CARRIER_ROLE" />
          </ZField>
          <ZField :label="tp('subjectType')">
            <ZSelect :value="item.subjectType" :options="subjectTypes" allow-clear :disabled="readonly" :placeholder="tp('choose')" :class="boxCtl" data-f="subjectType" @update:value="item.subjectType = str($event)" />
          </ZField>
          <ZField :label="tp('bin')">
            <ZInput :value="item.bin" mono :maxlength="32" :disabled="readonly" :class="ctl" data-f="bin" @update:value="item.bin = str($event)" />
          </ZField>
          <ZField :label="tp('name')" class="sm:col-span-2">
            <ZInput :value="item.name" :maxlength="500" :disabled="readonly" :class="ctl" data-f="name" @update:value="item.name = str($event)" />
          </ZField>
          <ZField :label="tp('country')">
            <ZSelect :value="item.countryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="tp('choose')" :class="boxCtl" data-f="countryCode" @update:value="item.countryCode = str($event)" />
          </ZField>
          <ZField :label="tp('phone')">
            <ZInput :value="item.phone" type="tel" :maxlength="64" :disabled="readonly" :class="ctl" data-f="phone" @update:value="item.phone = str($event)" />
          </ZField>
          <ZField :label="tp('email')">
            <ZInput :value="item.email" type="email" :maxlength="256" :disabled="readonly" :class="ctl" data-f="email" @update:value="item.email = str($event)" />
          </ZField>
        </div>
      </template>
    </RepeatCards>
  </RecordSection>
</template>
