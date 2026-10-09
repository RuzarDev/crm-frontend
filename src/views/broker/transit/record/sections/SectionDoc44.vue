<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Doc44List from '@/components/broker/Doc44List.vue'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import SectionAddButton from './SectionAddButton.vue'

// Раздел «Документы гр. 44» (доска TransitRecord, разбор §2.5): шапка раздела и «Добавить документ» — здесь, сам
// список (таблица или карточки, «Ещё» с уполномоченным органом, ИД органа и номером бланка) — общий Doc44List,
// тот же, что в ДТ Импорт 40. «Действует с / по» и «Страна выдачи» запись реестра не хранит — не показываются (B.6).
// extended=false — без «Ещё» (гр.44 партии пакета: у неё таких полей нет), новая строка — только код, вид, номер, дата.
withDefaults(defineProps<{ draft: RecordDraft; readonly: boolean; extended?: boolean }>(), { extended: true })
const { t } = useI18n()

const list = ref<InstanceType<typeof Doc44List> | null>(null)
</script>

<template>
  <RecordSection id="doc44" :title="t('broker.transitRecord.sections.doc44')" :count="draft.doc44.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="t('broker.transitRecord.doc44.add')" @click="list?.add()" />
    </template>
    <Doc44List ref="list" :items="draft.doc44" :readonly="readonly" :extended="extended" />
  </RecordSection>
</template>
