<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhCheckCircle } from '@phosphor-icons/vue'
import ZProgress from '@/components/z/ZProgress.vue'
import ZTag from '@/components/z/ZTag.vue'
import { formatDateText } from '@/ui/date'
import { formatNumberIn } from '@/ui/number'
import type { DtBlankProgress, DtReadinessItem } from './useDtReadiness'

// Правая панель «До подачи» (доска DtGeneral): прогресс бланка, пункты готовности с номером графы (клик — раздел
// и поле), курсы НБ РК на дату гр. А. Без права декларанта готовность не спрашиваем — остаются только курсы.
const props = defineProps<{
  /** Готовность доступна (право import40.declarant). */
  enabled: boolean
  /** Ответ готовности получен. */
  loaded: boolean
  items: DtReadinessItem[]
  blank: DtBlankProgress | null
  /** Курсы для показа: код и курс (₸ за единицу). */
  rates: { code: string; rate: number }[]
  /** Дата гр. А (YYYY-MM-DD). */
  ratesDate: string | null
  nbUnavailable: boolean
}>()
const emit = defineEmits<{ go: [item: DtReadinessItem] }>()
const { t, locale } = useI18n()

const fromXml = computed(() => props.items.some((i) => i.fromXml))
const fmtRate = (n: number) => formatNumberIn(locale.value, n, 2, 2)
const date = computed(() => formatDateText(props.ratesDate))
const graphLabel = (i: DtReadinessItem) => i.graph ?? '—'
</script>

<template>
  <div class="flex flex-col gap-3.5" data-dt-panel>
    <section v-if="enabled" class="rounded-panel border border-line bg-surface px-4 py-3.5" data-dt-panel-readiness>
      <div class="flex items-center gap-2">
        <h2 class="m-0 text-sm font-semibold text-ink">{{ t('broker.dt.panel.title') }}</h2>
        <span v-if="loaded && items.length" class="ml-auto text-[12.5px] tabular-nums text-muted" data-dt-panel-count>
          {{ t('broker.dt.panel.count', { n: items.length }) }}
        </span>
      </div>

      <div v-if="blank" class="mt-2.5" :title="blank.emptyGraphs.length ? t('broker.dt.panel.emptyGraphs', { list: blank.emptyGraphs.join(', ') }) : undefined">
        <div class="mb-1 flex justify-between text-[12.5px] text-ink-3">
          <span>{{ t('broker.dt.panel.blank') }}</span>
          <span class="tabular-nums" data-dt-panel-blank>{{ t('broker.dt.panel.blankOf', { filled: blank.filled, total: blank.total }) }}</span>
        </div>
        <ZProgress :percent="blank.pct" size="sm" :status="blank.complete ? 'success' : 'normal'" :aria-label="t('broker.dt.panel.blank')" />
      </div>

      <p v-if="loaded && !items.length" class="m-0 mt-3 flex items-center gap-1.5 text-[13px] text-tone-done-fg" data-dt-panel-ready>
        <PhCheckCircle :size="16" aria-hidden="true" />{{ t('broker.dt.panel.ready') }}
      </p>
      <ul v-else-if="items.length" class="m-0 mt-2.5 list-none p-0">
        <li v-for="(it, i) in items" :key="`${i}-${it.text}`" :class="i ? 'border-t border-line' : ''">
          <button
            type="button"
            class="flex min-h-11 w-full cursor-pointer items-start gap-2 rounded-field border-0 bg-transparent px-0 py-[7px] text-left font-sans text-[12.5px] leading-[1.35] text-ink-2 outline-hidden transition-colors duration-150 hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none"
            :aria-label="t('broker.dt.panel.goto', { graph: graphLabel(it), text: it.text })"
            data-dt-panel-item
            :data-section="it.section"
            @click="emit('go', it)"
          >
            <span class="min-w-[26px] shrink-0 font-mono font-medium text-gold-ink" aria-hidden="true">{{ graphLabel(it) }}</span>
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere]" aria-hidden="true">{{ it.text }}</span>
            <PhArrowRight :size="13" class="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-if="items.length" class="m-0 mt-2 text-xs text-muted">
        {{ fromXml ? t('broker.dt.panel.xmlNote') : t('broker.dt.panel.note') }}
      </p>
    </section>

    <section class="rounded-panel border border-line bg-surface px-4 py-3.5" data-dt-panel-rates>
      <div class="flex items-center gap-2">
        <h2 class="m-0 text-sm font-semibold text-ink">{{ t('broker.dt.panel.rates') }}</h2>
        <span v-if="date" class="ml-auto text-xs tabular-nums text-muted">{{ t('broker.dt.panel.ratesOn', { date }) }}</span>
      </div>
      <ZTag v-if="nbUnavailable" tone="wait" size="sm" class="mt-2" data-dt-panel-nb>{{ t('broker.dt.panel.nbUnavailable') }}</ZTag>
      <dl v-if="rates.length" class="m-0 mt-2">
        <div v-for="r in rates" :key="r.code" class="flex justify-between py-[3px] text-[12.5px]" data-dt-rate>
          <dt class="font-mono text-ink-3">{{ r.code }}</dt>
          <dd class="m-0 tabular-nums text-ink">{{ fmtRate(r.rate) }}&nbsp;₸</dd>
        </div>
      </dl>
      <p v-else class="m-0 mt-2 text-[12.5px] text-muted">{{ t('broker.dt.panel.noRates') }}</p>
      <p class="m-0 mt-1.5 text-xs text-muted">{{ t('broker.dt.panel.ratesNote') }}</p>
    </section>
  </div>
</template>
