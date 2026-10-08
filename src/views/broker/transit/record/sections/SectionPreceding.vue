<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ReestrPrecedingDocInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import { useRecordRefs } from './refs'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Предшествующие документы» (разбор §2.6 i): вид документа (классификатор 2009), номер, дата.
defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.preceding.${key}`)

const refs = useRecordRefs()
void refs.ensureClassifiers(['2009'])
const docTypeOptions = computed(() => refs.classifierOptions('2009'))
const cards = ref<{ add: () => void } | null>(null)
const newDoc = (): ReestrPrecedingDocInput => ({ docTypeCode: null, number: null, date: null })
</script>

<template>
  <RecordSection id="preceding" :title="t('broker.transitRecord.sections.preceding')" :count="draft.precedingDocs.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="tr('add')" @click="cards?.add()" />
    </template>
    <RepeatCards ref="cards" :items="draft.precedingDocs" :readonly="readonly" :empty-text="tr('empty')" :new-item="newDoc">
      <template #item="{ item }">
        <div :class="grid">
          <ZField :label="tr('docType')">
            <ZSelect :value="item.docTypeCode" :options="docTypeOptions" show-search allow-clear :disabled="readonly" :placeholder="t('broker.transitRecord.parties.choose')" :class="boxCtl" data-f="docTypeCode" @update:value="item.docTypeCode = str($event)" />
          </ZField>
          <ZField :label="tr('number')">
            <ZInput :value="item.number" mono :maxlength="256" :disabled="readonly" :class="ctl" data-f="number" @update:value="item.number = str($event)" />
          </ZField>
          <ZField :label="tr('date')">
            <ZDate :value="item.date" allow-clear :disabled="readonly" :class="ctl" data-f="date" @update:value="item.date = $event" />
          </ZField>
        </div>
      </template>
    </RepeatCards>
  </RecordSection>
</template>
