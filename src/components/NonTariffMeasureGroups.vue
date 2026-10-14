<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut } from '@phosphor-icons/vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import type { TnvedNonTariffMeasureDto } from '@/types/api'
import { safeUrl } from '@/views/references/regulations'
import { cleanActNumber, formatActDate, goodsOf, groupMeasures, type MeasureAct, type MeasureGrouping, type MeasureSectionKey } from './nonTariffMeasures'

// Нетарифные меры кода «как в справке D-Sector» (вкладки «Нетарифные меры» и «Экспорт» справочника,
// выбор кода ТН ВЭД, требуемые документы калькулятора). Разделы: by='docType' — меры нетарифного
// регулирования, льготы, прочая информация; by='required' — требуемые документы и льготы.
// В разделе — акты: ссылка «Решение … №299 от 28.05.2010 с изменениями …», заголовок акта; под ним
// документы (что требуется) и товары кода, к которым документ относится; коды гр. 33 — одной строкой.
const props = withDefaults(defineProps<{ measures: TnvedNonTariffMeasureDto[]; by?: MeasureGrouping }>(), { by: 'docType' })
const { t } = useI18n()
const tm = (key: string, params?: Record<string, unknown>) => t(`broker.references.tnved.measures.${key}`, params ?? {})

const TONE: Record<MeasureSectionKey, ZTone> = { restrictions: 'danger', required: 'danger', preferences: 'done', others: 'info' }

const sections = computed(() => groupMeasures(props.measures, props.by))

interface ActLink { text: string; href: string | null }

const actText = (name: string | null, number: string | null, date: string | null) => {
  const n = name ?? ''
  if (number && date) return tm('act', { name: n, number, date })
  if (number) return tm('actNoDate', { name: n, number })
  if (date) return tm('actNoNumber', { name: n, date })
  return n
}

const mainLink = (a: MeasureAct): ActLink | null =>
  a.name || a.number ? { text: actText(a.name, a.number, a.date).trim(), href: safeUrl(a.url) } : null

const amendmentLinks = (a: MeasureAct): ActLink[] =>
  a.amendments.map((x) => ({ text: actText(x.name, cleanActNumber(x.number), formatActDate(x.date)).trim(), href: safeUrl(x.url) }))

const linkClass = 'rounded-field underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus'
</script>

<template>
  <div v-if="sections.length" class="flex flex-col gap-5" data-measure-groups>
    <section v-for="s in sections" :key="s.key" :aria-label="tm(s.key)" :data-measure-group="s.key">
      <h4 class="m-0 mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
        <ZTag :tone="TONE[s.key]" size="sm">{{ tm(s.key) }}</ZTag>
        <span class="text-xs font-normal tabular-nums text-muted">{{ s.count }}</span>
      </h4>
      <ul role="list" class="m-0 flex list-none flex-col gap-2.5 p-0">
        <li v-for="a in s.acts" :key="a.key" class="min-w-0 rounded-row border border-line px-3.5 py-3" data-measure-act>
          <p v-if="mainLink(a) || a.amendments.length" class="m-0 text-[13px] leading-5 break-words text-pretty text-ink-2" data-measure-act-line>
            <template v-if="mainLink(a)">
              <a
                v-if="mainLink(a)!.href"
                :href="mainLink(a)!.href!"
                target="_blank"
                rel="noopener noreferrer"
                :class="[linkClass, 'font-semibold text-zircon-ink']"
                data-measure-act-link
              >{{ mainLink(a)!.text }}<PhArrowSquareOut :size="13" class="ml-1 inline-block align-[-2px]" aria-hidden="true" /><span class="sr-only"> ({{ tm('opensInNewTab') }})</span></a>
              <span v-else class="font-semibold text-ink">{{ mainLink(a)!.text }}</span>
            </template>
            <template v-if="a.amendments.length">
              {{ ' ' }}<span class="text-ink-3">{{ tm('withAmendments') }}</span>{{ ' ' }}
              <template v-for="(l, i) in amendmentLinks(a)" :key="i">
                <a v-if="l.href" :href="l.href" target="_blank" rel="noopener noreferrer" :class="[linkClass, 'text-zircon-ink']" data-measure-amendment>{{ l.text }}<span class="sr-only"> ({{ tm('opensInNewTab') }})</span></a>
                <span v-else data-measure-amendment>{{ l.text }}</span>{{ i < a.amendments.length - 1 ? ', ' : '' }}
              </template>
            </template>
          </p>
          <p v-if="a.title" class="m-0 mt-0.5 text-[13px] leading-5 break-words text-muted" data-measure-act-title>{{ a.title }}</p>

          <ul v-if="a.docs.length" class="m-0 mt-2 flex list-disc flex-col gap-2 pl-5 marker:text-ink-3">
            <li v-for="(m, i) in a.docs" :key="i" class="min-w-0" data-measure>
              <span class="text-sm leading-5 font-medium break-words text-pretty text-ink">{{ m.name }}</span>
              <p v-if="m.comment" class="m-0 mt-0.5 text-[13px] leading-5 break-words text-ink-3" data-measure-comment>{{ m.comment }}</p>
              <ul v-if="goodsOf(m).length" class="m-0 mt-1 flex list-[circle] flex-col gap-0.5 pl-5 text-[13px] leading-5 text-ink-2 marker:text-ink-3" data-measure-goods>
                <li v-for="(g, j) in goodsOf(m)" :key="j" class="break-words whitespace-pre-line">{{ g }}</li>
              </ul>
            </li>
          </ul>

          <div v-if="a.gr33.length" class="mt-2 flex flex-wrap items-center gap-1.5" data-measure-gr33>
            <span class="mr-0.5 text-[13px] leading-5 text-ink-2">{{ tm('gr33Codes') }}:</span>
            <span
              v-for="c in a.gr33"
              :key="c"
              class="inline-flex h-6 items-center rounded-pill border border-line bg-sunken px-2 font-mono text-xs tabular-nums text-ink"
              data-gr33-code
            >{{ c }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
