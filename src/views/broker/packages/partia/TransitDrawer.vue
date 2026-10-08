<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import RecordNav from '@/views/broker/transit/record/RecordNav.vue'
import type { RecordDraft } from '@/views/broker/transit/record/recordModel'
import SectionCarriers from '@/views/broker/transit/record/sections/SectionCarriers.vue'
import SectionContainers from '@/views/broker/transit/record/sections/SectionContainers.vue'
import SectionGuarantees from '@/views/broker/transit/record/sections/SectionGuarantees.vue'
import SectionMain from '@/views/broker/transit/record/sections/SectionMain.vue'
import SectionMisc from '@/views/broker/transit/record/sections/SectionMisc.vue'
import SectionOrganizations from '@/views/broker/transit/record/sections/SectionOrganizations.vue'
import SectionPackaging from '@/views/broker/transit/record/sections/SectionPackaging.vue'
import SectionPreceding from '@/views/broker/transit/record/sections/SectionPreceding.vue'
import SectionSeals from '@/views/broker/transit/record/sections/SectionSeals.vue'
import SectionTransport from '@/views/broker/transit/record/sections/SectionTransport.vue'
import { PARTIA_TRANSIT_SECTIONS } from './partiaModel'

// Транзитная декларация партии в широкой шторке (доска PartiaEditor, «Открыть»): разделы записи транзита (4б)
// по record черновика партии — «Основное» без «Пост», организации, перевозчики, транспорт, пломбы, контейнеры,
// упаковка, предшествующие, гарантия, прочее. Слева (на узком — лентой сверху) — меню разделов, как на записи
// транзита, со своей прокруткой. Правки идут прямо в черновик партии и сохраняются кнопкой «Сохранить партию».
defineProps<{ open: boolean; draft: RecordDraft; readonly: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const scroller = ref<HTMLElement | null>(null)
</script>

<template>
  <ZDrawer :open="open" :width="1080" :title="t('broker.partia.transit.title')" data-transit-drawer @update:open="emit('update:open', $event)">
    <!-- Своя область прокрутки во всё тело шторки: по ней считает меню разделов; шапки оболочки над ней нет. -->
    <div
      ref="scroller"
      class="-mx-6 -my-4 h-[calc(100%+2rem)] overflow-y-auto px-6 py-4 [--shell-header-h:0px]"
      data-transit-scroller
    >
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-7 gap-y-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <RecordNav
          :draft="draft"
          :sections="PARTIA_TRANSIT_SECTIONS"
          :scroller="scroller"
          :tracking="open"
          :label="t('broker.partia.transit.navLabel')"
        />
        <div class="flex min-w-0 flex-col gap-[18px]" data-transit-sections>
          <SectionMain :draft="draft" :readonly="readonly" :with-post="false" />
          <SectionOrganizations :draft="draft" :readonly="readonly" />
          <SectionCarriers :draft="draft" :readonly="readonly" />
          <SectionTransport :draft="draft" :readonly="readonly" />
          <SectionSeals :draft="draft" :readonly="readonly" />
          <SectionContainers :draft="draft" :readonly="readonly" />
          <SectionPackaging :draft="draft" :readonly="readonly" />
          <SectionPreceding :draft="draft" :readonly="readonly" />
          <SectionGuarantees :draft="draft" :readonly="readonly" />
          <SectionMisc :draft="draft" :readonly="readonly" />
        </div>
      </div>
    </div>

    <template #footer>
      <p v-if="!readonly" class="m-0 mr-auto min-w-0 flex-1 basis-60 self-center text-[12.5px] text-muted" data-transit-hint>{{ t('broker.partia.transit.hint') }}</p>
      <ZButton variant="primary" class="max-sm:h-11 max-sm:w-full" data-transit-done @click="emit('update:open', false)">{{ t('broker.partia.transit.done') }}</ZButton>
    </template>
  </ZDrawer>
</template>
