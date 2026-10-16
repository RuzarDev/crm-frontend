<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCode, PhFileText, PhPrinter } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import type { ZOptionValue } from '@/ui/options'

// Шапка раздела «ДТС» (доска DtDts): название, форма ДТС-1 / ДТС-2 · безвозмездно (в просмотре — только видна),
// «Печать», «Инф. лист», «XML». Выгрузки — не правка: доступны и в просмотре (страница сохраняет перед ними только
// при праве править). Главное действие страницы — «Сформировать XML» ДТ в шапке, поэтому здесь XML — обводкой.
const props = defineProps<{
  free: boolean
  readonly: boolean
  printing: 'pdf' | 'info-sheet-pdf' | null
  xmlLoading: boolean
  /** Без «XML»: исходная ДТ разделения не подаётся — ДТС выгружается по частям (сервер отвечает 409). */
  noXml?: boolean
}>()
const emit = defineEmits<{ form: [free: boolean]; print: [kind: 'pdf' | 'info-sheet-pdf']; xml: [] }>()
const { t } = useI18n()

const options = computed(() => [
  { value: 'dts1', label: t('broker.dt.dts.form1') },
  { value: 'dts2', label: t('broker.dt.dts.form2') },
])
const busy = computed(() => props.printing !== null || props.xmlLoading)
const onForm = (v: ZOptionValue) => emit('form', v === 'dts2')
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-3" data-dts-toolbar>
    <h2 class="m-0 text-[15px] font-semibold text-ink">{{ t('broker.dt.dts.title') }}</h2>
    <ZSegmented
      :value="free ? 'dts2' : 'dts1'"
      :options="options"
      :disabled="readonly"
      :aria-label="t('broker.dt.dts.form')"
      data-dts-form
      @change="onForm"
    />
    <div
      class="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:grid max-sm:w-full"
      :class="noXml ? 'max-sm:grid-cols-2' : 'max-sm:grid-cols-3'"
    >
      <ZButton
        variant="ghost"
        class="max-sm:h-11 max-sm:px-2"
        :loading="printing === 'pdf'"
        :disabled="busy && printing !== 'pdf'"
        data-dts-print
        @click="emit('print', 'pdf')"
      ><PhPrinter :size="16" class="shrink-0" aria-hidden="true" />{{ t('broker.dt.dts.print') }}</ZButton>
      <ZButton
        variant="ghost"
        class="max-sm:h-11 max-sm:px-2"
        :loading="printing === 'info-sheet-pdf'"
        :disabled="busy && printing !== 'info-sheet-pdf'"
        data-dts-info-sheet
        @click="emit('print', 'info-sheet-pdf')"
      ><PhFileText :size="16" class="shrink-0" aria-hidden="true" />{{ t('broker.dt.dts.infoSheet') }}</ZButton>
      <ZButton
        v-if="!noXml"
        class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11 max-sm:px-2"
        :loading="xmlLoading"
        :disabled="busy && !xmlLoading"
        data-dts-xml
        @click="emit('xml')"
      ><PhCode :size="16" class="shrink-0" aria-hidden="true" />{{ t('broker.dt.dts.xml') }}</ZButton>
    </div>
  </div>
</template>
