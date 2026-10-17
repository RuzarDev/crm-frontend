<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhInfo, PhSparkle, PhWarning } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import {
  aiTnvedApi, type AiTnvedCharacteristics, type AiTnvedCode, type AiTnvedSource, type AiTnvedSuggestResponse,
} from '@/api/aiTnved'
import { formatTnvedCode, isRateLimited } from '@/views/references/tnvedShared'
import AiTnvedCard from './AiTnvedCard.vue'
import { collectQuestions } from './aiTnved'

// Подбор кода ТН ВЭД с ИИ (17.10): описание и необязательные характеристики → карточки 3–5 кодов. Уточняющие
// вопросы — полями, ответы уходят повторным запросом. ИИ недоступен (выключен, не ответил, лимит) — обычный поиск по
// словам и плашка «ИИ недоступен». «Выбрать» записывает подтверждение (история для следующих подборов) и отдаёт код.
const props = withDefaults(defineProps<{
  initialDescription?: string
  source: AiTnvedSource
  caseId?: string | null
  /** Подпись кнопки выбора (в справочнике — «Открыть»). */
  selectLabel?: string
  /** Записывать выбор как подтверждённый код (история). В справочнике — нет: там это просмотр. */
  confirm?: boolean
}>(), { initialDescription: '', caseId: null, selectLabel: '', confirm: true })
const emit = defineEmits<{ select: [payload: { code: string; name: string }] }>()
const { t } = useI18n()
const uid = useId()

const description = ref(props.initialDescription)
const showMore = ref(false)
const ch = reactive<{ material: string; purpose: string; composition: string; model: string; other: string; retail: 'unknown' | 'yes' | 'no' }>({
  material: '', purpose: '', composition: '', model: '', other: '', retail: 'unknown',
})
const answers = reactive<Record<string, string>>({})
const state = ref<'idle' | 'loading' | 'ready' | 'error' | 'limit'>('idle')
const result = shallowRef<AiTnvedSuggestResponse | null>(null)
const resultEl = ref<HTMLElement | null>(null)
const tooShort = computed(() => description.value.trim().length < 3)

const characteristics = (): AiTnvedCharacteristics | null => {
  const c: AiTnvedCharacteristics = {
    material: ch.material.trim() || null, purpose: ch.purpose.trim() || null, composition: ch.composition.trim() || null,
    model: ch.model.trim() || null, other: ch.other.trim() || null, retail: ch.retail === 'unknown' ? null : ch.retail === 'yes',
  }
  return Object.values(c).some((v) => v !== null) ? c : null
}

let seq = 0
let lastWithAnswers = false
const run = async (withAnswers = false) => {
  if (tooShort.value || state.value === 'loading') return
  const my = ++seq
  lastWithAnswers = withAnswers
  state.value = 'loading'
  try {
    const res = await aiTnvedApi.suggest({
      description: description.value.trim(),
      characteristics: characteristics(),
      answers: withAnswers
        ? Object.entries(answers).filter(([, a]) => a.trim()).map(([question, answer]) => ({ question, answer: answer.trim() }))
        : null,
      source: props.source,
      caseId: props.caseId,
    })
    if (my !== seq) return
    result.value = res
    if (!withAnswers) for (const k of Object.keys(answers)) delete answers[k]
    state.value = 'ready'
    // На телефоне результат ниже формы — показать его.
    await nextTick()
    resultEl.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  } catch (e) {
    if (my === seq) state.value = isRateLimited(e) ? 'limit' : 'error'
  }
}

const questions = computed(() => (result.value?.aiUsed ? collectQuestions(result.value) : []))
const hasAnswers = computed(() => Object.values(answers).some((a) => a.trim()))
const unavailableText = computed(() => (result.value?.unavailable ? t(`aiTnved.unavailable.${result.value.unavailable}`) : ''))

const pick = (code: string, name: string) => {
  const id = result.value?.suggestionId
  if (id && props.confirm) void aiTnvedApi.select(id, code).catch(() => { /* подтверждение — не главное: код всё равно выбран */ })
  emit('select', { code, name })
}
const onCard = (c: AiTnvedCode) => pick(c.code, c.name)
const retailOptions = computed(() => [
  { value: 'unknown', label: t('aiTnved.retail.unknown') },
  { value: 'yes', label: t('aiTnved.retail.yes') },
  { value: 'no', label: t('aiTnved.retail.no') },
])
</script>

<template>
  <div class="flex flex-col gap-4" data-ai-panel>
    <p class="m-0 flex items-start gap-1.5 rounded-row bg-sunken px-3 py-2 text-[13px] text-ink-2" data-ai-disclaimer>
      <PhInfo :size="15" class="mt-px shrink-0 text-muted" aria-hidden="true" />{{ t('aiTnved.disclaimer') }}
    </p>

    <form class="flex flex-col gap-3" novalidate @submit.prevent="run(false)">
      <ZField :label="t('aiTnved.description')" :help="t('aiTnved.descriptionHelp')">
        <ZTextarea v-model:value="description" :rows="2" auto-grow :maxlength="1000" :placeholder="t('aiTnved.descriptionPh')" data-ai-description />
      </ZField>
      <button
        type="button"
        class="inline-flex min-h-11 w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-sans text-sm font-medium text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-7"
        :aria-expanded="showMore"
        :aria-controls="`ai-more-${uid}`"
        data-ai-more
        @click="showMore = !showMore"
      >
        <PhCaretDown :size="14" aria-hidden="true" :class="showMore ? 'rotate-180' : ''" />{{ t('aiTnved.characteristics') }}
      </button>
      <div v-show="showMore" :id="`ai-more-${uid}`" class="grid grid-cols-1 gap-3 sm:grid-cols-2" data-ai-characteristics>
        <ZField :label="t('aiTnved.ch.material')"><ZInput v-model:value="ch.material" :maxlength="300" :placeholder="t('aiTnved.ch.materialPh')" class="max-sm:h-11" data-ai-ch="material" /></ZField>
        <ZField :label="t('aiTnved.ch.purpose')"><ZInput v-model:value="ch.purpose" :maxlength="300" :placeholder="t('aiTnved.ch.purposePh')" class="max-sm:h-11" data-ai-ch="purpose" /></ZField>
        <ZField :label="t('aiTnved.ch.composition')"><ZInput v-model:value="ch.composition" :maxlength="300" :placeholder="t('aiTnved.ch.compositionPh')" class="max-sm:h-11" data-ai-ch="composition" /></ZField>
        <ZField :label="t('aiTnved.ch.model')"><ZInput v-model:value="ch.model" :maxlength="300" class="max-sm:h-11" data-ai-ch="model" /></ZField>
        <ZField :label="t('aiTnved.ch.retail')" class="sm:col-span-2">
          <ZSegmented :value="ch.retail" :options="retailOptions" :aria-label="t('aiTnved.ch.retail')" data-ai-ch="retail" @update:value="ch.retail = $event as typeof ch.retail" />
        </ZField>
      </div>
      <ZButton variant="primary" html-type="submit" :loading="state === 'loading'" :disabled="tooShort" class="w-fit max-sm:h-11 max-sm:w-full" data-ai-run>
        <template #icon><PhSparkle :size="16" aria-hidden="true" /></template>{{ t('aiTnved.run') }}
      </ZButton>
    </form>

    <div v-if="state === 'loading'" class="flex flex-col gap-2" aria-busy="true" data-ai-loading>
      <p class="m-0 text-sm text-ink-3" role="status">{{ t('aiTnved.loading') }}</p>
      <ZSkeleton v-for="i in 3" :key="i" height="96px" />
    </div>
    <p v-else-if="state === 'error' || state === 'limit'" class="m-0 flex flex-wrap items-center gap-2 rounded-row border border-solid border-line px-4 py-3 text-sm text-ink-2" role="alert" data-ai-error>
      {{ t(state === 'limit' ? 'aiTnved.rateLimited' : 'aiTnved.error') }}
      <ZButton size="sm" class="max-sm:h-11" data-ai-retry @click="run(lastWithAnswers)">{{ t('aiTnved.retry') }}</ZButton>
    </p>

    <div v-else-if="state === 'ready' && result" ref="resultEl" class="flex scroll-mt-2 flex-col gap-4" data-ai-result>
      <!-- ИИ недоступен: обычный поиск по словам -->
      <template v-if="!result.aiUsed">
        <p class="m-0 flex items-start gap-1.5 rounded-row bg-gold-soft px-3 py-2.5 text-sm text-gold-ink" role="status" data-ai-unavailable>
          <PhWarning :size="16" class="mt-px shrink-0" aria-hidden="true" />
          <span><b>{{ t('aiTnved.unavailableTitle') }}</b> {{ unavailableText }}</span>
        </p>
        <p v-if="!result.fallback.length" class="m-0 text-sm text-ink-3" data-ai-fallback-empty>{{ t('aiTnved.fallbackEmpty') }}</p>
        <ul v-else role="list" class="m-0 list-none rounded-row border border-solid border-line p-0" data-ai-fallback>
          <li v-for="(m, i) in result.fallback" :key="m.code" :class="['flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5', i > 0 && 'border-0 border-t border-solid border-line']" :data-ai-fallback-row="m.code">
            <div class="min-w-0 flex-1 basis-56">
              <span class="font-mono text-sm font-semibold text-ink tabular-nums">{{ formatTnvedCode(m.code) }}</span>
              <span class="block text-[13px] break-words text-ink-2">{{ m.description }}</span>
            </div>
            <span v-if="m.rateStr" class="text-xs text-muted">{{ t('aiTnved.dutyShort', { rate: m.rateStr }) }}</span>
            <ZButton size="sm" class="max-sm:h-11 max-sm:w-full" data-ai-fallback-select @click="pick(m.code, m.description)">{{ selectLabel || t('aiTnved.select') }}</ZButton>
          </li>
        </ul>
      </template>

      <template v-else>
        <!-- Надпись — всегда прямо над результатом (верхняя уходит из вида при прокрутке на телефоне). -->
        <p class="m-0 text-[13px] font-medium text-ink-2" data-ai-result-disclaimer>{{ t('aiTnved.disclaimerShort') }}</p>
        <p class="m-0 -mt-3 text-xs text-muted" data-ai-meta>
          {{ result.fromCache ? t('aiTnved.fromCache') : t('aiTnved.answered') }}
        </p>
        <div class="flex flex-col gap-2.5" data-ai-cards>
          <AiTnvedCard v-for="(s, i) in result.suggestions" :key="s.code" :item="s" :rank="i + 1" selectable :select-label="selectLabel" @select="onCard" />
        </div>
        <section v-if="questions.length" class="flex flex-col gap-2 rounded-row border border-solid border-line px-4 py-3" :aria-labelledby="`ai-q-${uid}`" data-ai-questions>
          <h3 :id="`ai-q-${uid}`" class="m-0 text-sm font-semibold text-ink">{{ t('aiTnved.questionsTitle') }}</h3>
          <p class="m-0 text-[13px] text-ink-3">{{ t('aiTnved.questionsHint') }}</p>
          <ZField v-for="q in questions" :key="q" :label="q">
            <ZInput v-model:value="answers[q]" :maxlength="300" class="max-sm:h-11" :data-ai-answer="q" />
          </ZField>
          <ZButton :disabled="!hasAnswers" class="w-fit max-sm:h-11 max-sm:w-full" data-ai-refine @click="run(true)">{{ t('aiTnved.refine') }}</ZButton>
        </section>
      </template>
    </div>
  </div>
</template>
