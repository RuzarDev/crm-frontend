<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhClockCounterClockwise } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { AiTnvedCode } from '@/api/aiTnved'
import { formatTnvedCode } from '@/views/references/tnvedShared'
import { confidencePct, confidenceTone, vatKey } from './aiTnved'

// Карточка кода из подсказки ИИ: код и путь, уверенность, обоснование по ОПИ и отличие от соседних, пошлина, НДС,
// акциз, антидемпинг, меры, маркировка, запреты (это — из справочников, не от модели) и «Выбрать».
const props = defineProps<{ item: AiTnvedCode; rank: number; selectable: boolean }>()
const emit = defineEmits<{ select: [item: AiTnvedCode] }>()
const { t } = useI18n()

const measures = computed(() => props.item.info.measures
  .filter((m) => !m.resolutionId?.startsWith('KZ-MARKING') && !m.resolutionId?.startsWith('KZ-NAT-'))
  .map((m) => m.name))
const shownMeasures = computed(() => measures.value.slice(0, 4))
const path = computed(() => props.item.path.filter((p) => p.code !== props.item.code))
const row = 'grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-1 text-[13px] max-sm:grid-cols-1'
</script>

<template>
  <article class="flex flex-col gap-2.5 rounded-row border border-solid border-line bg-surface px-4 py-3" :data-ai-card="item.code">
    <header class="flex flex-wrap items-start gap-x-3 gap-y-1.5">
      <div class="min-w-0 flex-1 basis-56">
        <p class="m-0 flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted tabular-nums">{{ rank }}.</span>
          <span class="font-mono text-[16px] font-semibold text-ink tabular-nums" data-ai-code>{{ formatTnvedCode(item.code) }}</span>
          <ZTag :tone="confidenceTone(item.confidence)" size="sm" data-ai-confidence>{{ t('aiTnved.confidence', { pct: confidencePct(item.confidence) }) }}</ZTag>
          <ZTag v-if="item.fromHistory" tone="info" size="sm" data-ai-history>
            <PhClockCounterClockwise :size="12" aria-hidden="true" class="mr-0.5" />{{ t(item.clientHistory ? 'aiTnved.historyClient' : 'aiTnved.history') }}
          </ZTag>
        </p>
        <p class="m-0 mt-0.5 text-sm break-words text-ink-2">{{ item.name }}</p>
        <p v-if="path.length" class="m-0 mt-0.5 text-xs break-words text-muted" data-ai-path>
          {{ path.map((p) => `${p.code} ${p.name}`).join(' → ') }}
        </p>
      </div>
      <ZButton v-if="selectable" variant="primary" size="sm" class="max-sm:h-11 max-sm:w-full" data-ai-select @click="emit('select', item)">
        <template #icon><PhCheck :size="14" aria-hidden="true" /></template>{{ t('aiTnved.select') }}
      </ZButton>
    </header>

    <dl class="m-0 border-0 border-t border-solid border-line pt-1.5">
      <div :class="row" data-ai-reasoning>
        <dt class="text-muted">{{ t('aiTnved.reasoning') }}</dt>
        <dd class="m-0 break-words text-ink">{{ item.reasoning }}<span v-if="item.opi" class="text-ink-3">{{ ` (${item.opi})` }}</span></dd>
      </div>
      <div v-if="item.differences" :class="row" data-ai-differences>
        <dt class="text-muted">{{ t('aiTnved.differences') }}</dt>
        <dd class="m-0 break-words text-ink">{{ item.differences }}</dd>
      </div>
      <div :class="row" data-ai-duty>
        <dt class="text-muted">{{ t('aiTnved.duty') }}</dt>
        <dd class="m-0 text-ink">
          {{ item.info.dutyRate || t('aiTnved.noRate') }}<template v-if="item.info.vtoRate"> · {{ t('aiTnved.vto', { rate: item.info.vtoRate }) }}</template>
        </dd>
      </div>
      <div :class="row" data-ai-vat>
        <dt class="text-muted">{{ t('aiTnved.vatLabel') }}</dt>
        <dd class="m-0 text-ink">{{ t(vatKey(item.info.vatStatus)) }}</dd>
      </div>
      <div v-if="item.info.excise.length" :class="row" data-ai-excise>
        <dt class="text-muted">{{ t('aiTnved.excise') }}</dt>
        <dd class="m-0 break-words text-ink">{{ item.info.excise.join('; ') }}</dd>
      </div>
      <div v-if="item.info.antiDumping.length" :class="row" data-ai-antidumping>
        <dt class="text-muted">{{ t('aiTnved.antiDumping') }}</dt>
        <dd class="m-0 break-words text-gold-ink">{{ item.info.antiDumping.join('; ') }}</dd>
      </div>
      <div v-if="item.info.marking.length" :class="row" data-ai-marking>
        <dt class="text-muted">{{ t('aiTnved.marking') }}</dt>
        <dd class="m-0 break-words text-gold-ink">{{ item.info.marking.join('; ') }}</dd>
      </div>
      <div v-if="item.info.bans.length" :class="row" data-ai-bans>
        <dt class="text-muted">{{ t('aiTnved.bans') }}</dt>
        <dd class="m-0 break-words font-semibold text-tone-danger-fg">{{ item.info.bans.join('; ') }}</dd>
      </div>
      <div :class="row" data-ai-measures>
        <dt class="text-muted">{{ t('aiTnved.measures') }}</dt>
        <dd class="m-0 break-words text-ink">
          <template v-if="measures.length">
            {{ shownMeasures.join('; ') }}<template v-if="measures.length > shownMeasures.length"> {{ t('aiTnved.moreMeasures', { n: measures.length - shownMeasures.length }) }}</template>
          </template>
          <template v-else>{{ t('aiTnved.noMeasures') }}</template>
        </dd>
      </div>
    </dl>
  </article>
</template>
