<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhInfo } from '@phosphor-icons/vue'
import type { MarkingMatchRow } from '@/api/nationalLists'
import { formatActDate } from '@/components/nonTariffMeasures'

// Подсказка у маркировки товара (гр. 31.13): код в перечне товаров, подлежащих маркировке (Приказ МТИ РК № 199-НҚ,
// ред. 04.09.2026) — «Подлежит маркировке с …» на дату гр. А или «Будет подлежать с …». Позиция «из …» — только часть
// кода: «возможно подлежит» и наименование. Позиции под вопросом после Приказа № 253-ОД — «возможно подлежит» и «сверьте».
// Только подсказка:
// строки маркировки и признак «М» гр. 33 сами не ставятся.
const props = defineProps<{ rows: readonly MarkingMatchRow[]; act: string }>()
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.markings.list.${key}`, p ?? {})

const lines = computed(() => props.rows.map((r) => {
  const date = formatActDate(r.startDate) ?? r.startDate
  // Позиция под вопросом после 253-ОД — «возможно подлежит … под вопросом»; «из …» — «возможно подлежит, часть кода».
  const head = r.check
    ? tm(r.required ? 'checkRequired' : 'checkUpcoming', { date })
    : r.partial
      ? tm(r.required ? 'maybeRequired' : 'maybeUpcoming', { date })
      : tm(r.required ? 'required' : 'upcoming', { date })
  return { r, head, source: tm('source', { act: props.act, n: r.number }) }
}))
</script>

<template>
  <div v-if="rows.length" class="flex items-start gap-x-3 rounded-row bg-tone-info-bg px-2.5 py-2 text-[13px] leading-5 text-ink-2" role="note" data-marking-hint>
    <PhInfo :size="16" class="mt-0.5 shrink-0 text-zircon-ink" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <div v-for="l in lines" :key="l.r.number" class="flex min-w-0 flex-col gap-0.5" :data-marking-hint-row="l.r.required ? 'required' : 'upcoming'">
        <span class="text-ink">{{ l.head }} <span class="text-muted">· {{ l.source }}</span></span>
        <span v-if="l.r.partial" class="line-clamp-2 text-xs text-muted" :title="l.r.name" data-marking-hint-only>{{ tm('only', { name: l.r.name }) }}</span>
        <span v-if="l.r.condition" class="line-clamp-2 text-xs text-muted" :title="l.r.condition" data-marking-hint-condition>{{ l.r.condition }}</span>
        <span v-if="l.r.check" class="text-xs text-gold-ink" :title="l.r.check" data-marking-hint-check>{{ tm('check') }}</span>
      </div>
    </div>
  </div>
</template>
