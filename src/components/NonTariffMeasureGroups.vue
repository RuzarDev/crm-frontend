<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut } from '@phosphor-icons/vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import type { TnvedNonTariffMeasureDto } from '@/types/api'
import { safeUrl } from '@/views/references/regulations'

// Нетарифные меры кода ТН ВЭД группами (редизайн, волна 5а): вкладки «Нетарифные меры» и «Экспорт»
// справочника и требуемые документы в калькуляторе.
// by='docType' — по виду документа КЕДЕН: ограничения, льготы, прочие, уведомления (неизвестный вид — в прочие);
// by='required' — для расчёта: требуемые документы (всё, кроме льгот) и льготы.
const props = withDefaults(defineProps<{ measures: TnvedNonTariffMeasureDto[]; by?: 'docType' | 'required' }>(), { by: 'docType' })
const { t } = useI18n()

interface Group { key: string; label: string; tone: ZTone; items: TnvedNonTariffMeasureDto[] }

const groups = computed<Group[]>(() => {
  const list = props.measures ?? []
  const of = (pred: (m: TnvedNonTariffMeasureDto) => boolean) => list.filter(pred)
  const all: Group[] = props.by === 'required'
    ? [
        { key: 'required', label: t('broker.references.tnved.measures.required'), tone: 'danger', items: of((m) => m.docType !== 'PREFERENCE') },
        { key: 'preferences', label: t('broker.references.tnved.measures.preferences'), tone: 'done', items: of((m) => m.docType === 'PREFERENCE') },
      ]
    : [
        { key: 'restrictions', label: t('broker.references.tnved.measures.restrictions'), tone: 'danger', items: of((m) => m.docType === 'RESTRICTION') },
        { key: 'preferences', label: t('broker.references.tnved.measures.preferences'), tone: 'done', items: of((m) => m.docType === 'PREFERENCE') },
        { key: 'others', label: t('broker.references.tnved.measures.others'), tone: 'info', items: of((m) => !['RESTRICTION', 'PREFERENCE', 'NOTICE'].includes(m.docType)) },
        { key: 'notices', label: t('broker.references.tnved.measures.notices'), tone: 'wait', items: of((m) => m.docType === 'NOTICE') },
      ]
  return all.filter((g) => g.items.length > 0)
})
</script>

<template>
  <div v-if="groups.length" class="flex flex-col gap-4" data-measure-groups>
    <section v-for="g in groups" :key="g.key" :aria-label="g.label" :data-measure-group="g.key">
      <h4 class="m-0 mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <ZTag :tone="g.tone" size="sm">{{ g.label }}</ZTag>
        <span class="text-xs font-normal tabular-nums text-muted">{{ g.items.length }}</span>
      </h4>
      <ul role="list" class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="(m, i) in g.items" :key="i" class="rounded-row border border-line px-3.5 py-2.5" data-measure>
          <p class="m-0 text-sm font-medium text-ink text-pretty">{{ m.name }}</p>
          <p v-if="m.comment" class="m-0 mt-0.5 text-[13px] leading-5 text-ink-3">{{ m.comment }}</p>
          <p v-if="m.resolutionName" class="m-0 mt-1 text-[13px] leading-5 text-ink-2">
            <a
              v-if="safeUrl(m.resolutionUrl)"
              :href="safeUrl(m.resolutionUrl)!"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 rounded-field text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus"
            >{{ m.resolutionName }}<PhArrowSquareOut :size="13" aria-hidden="true" /></a>
            <span v-else>{{ m.resolutionName }}</span>
            <span v-if="m.resolutionNumber" class="ml-1">{{ t('broker.references.tnved.measures.resolutionNo', { n: m.resolutionNumber }) }}</span>
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
