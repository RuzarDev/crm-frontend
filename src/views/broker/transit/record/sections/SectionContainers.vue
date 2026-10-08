<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import type { ReestrContainerInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import SectionAddButton from './SectionAddButton.vue'
import { ctl, str } from './ui'

// Раздел «Контейнеры» (разбор §2.6 h): номер (моно, верхний регистр при вводе, без проверки ISO 6346) и заметка;
// строки в одну линию, без карточки. Верхний регистр — прямо в поле с возвратом каретки: правка в середине номера
// не уносит её в конец (Ctrl/⌘+S в поле тоже сохраняет уже заглавными).
defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.containers.${key}`)

const cards = ref<{ add: () => void } | null>(null)
const newContainer = (): ReestrContainerInput => ({ containerNumber: null, note: null })
const onNumberInput = (item: ReestrContainerInput, e: Event) => {
  const el = e.target as HTMLInputElement
  const up = el.value.toUpperCase()
  if (up !== el.value && !(e as InputEvent).isComposing) {
    const { selectionStart: from, selectionEnd: to, selectionDirection: dir } = el
    el.value = up // поле уже совпадает с данными — Vue его не перезапишет и каретку не сдвинет
    if (from !== null && to !== null) el.setSelectionRange(Math.min(from, up.length), Math.min(to, up.length), dir ?? undefined)
  }
  item.containerNumber = str(up)
}
</script>

<template>
  <RecordSection id="containers" :title="t('broker.transitRecord.sections.containers')" :count="draft.containers.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="tr('add')" @click="cards?.add()" />
    </template>
    <RepeatCards ref="cards" inline :items="draft.containers" :readonly="readonly" :empty-text="tr('empty')" :new-item="newContainer">
      <template #item="{ item }">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ZField :label="tr('number')">
            <ZInput :value="item.containerNumber" mono :maxlength="64" :disabled="readonly" :class="ctl" data-f="containerNumber" @change="onNumberInput(item, $event)" />
          </ZField>
          <ZField :label="tr('note')">
            <ZInput :value="item.note" :maxlength="500" :disabled="readonly" :class="ctl" data-f="note" @update:value="item.note = str($event)" />
          </ZField>
        </div>
      </template>
    </RepeatCards>
  </RecordSection>
</template>
