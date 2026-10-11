<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { cn } from '@/ui/cn'
import type { ZOptionValue } from '@/ui/options'
import type { DtFormState } from '../dtPayload'

// Вопросы 7–9 ДТС (Да/Нет) и «Причины выбора метода» (гр. 7 ДТС-2). Пишут в форму ДТ — сохраняются обычным PUT.
// Буквы — как на бланке ДТС-1: 9а — лицензионные платежи (RoyaltyFee), 9б — часть дохода продавцу (SubsequentResale);
// «договорные отношения по ИС» (RoyaltyContract) есть только в XML R.038 — последним, с пометкой «только в XML».
// 7б и 7в имеют смысл только при 7а = «Да»: при «Нет» они недоступны, а ответ «Нет» в 7а сбрасывает их в «Нет»
// (сервер их тогда не выводит, но в базе не остаётся прежнее «Да»).
type QuestionKey =
  | 'dtsRelation' | 'dtsRelationPriceInfluence' | 'dtsRelationApproxValue'
  | 'dtsRestriction' | 'dtsValueCondition' | 'dtsRoyaltyFee' | 'dtsSubsequentResale' | 'dtsRoyaltyContract'

const props = defineProps<{ form: DtFormState; readonly: boolean }>()
const { t } = useI18n()
const tq = (key: string) => t(`broker.dt.dts.questions.${key}`)

const QUESTIONS: { key: QuestionKey; n: string; text: string; relation?: boolean; xmlOnly?: boolean }[] = [
  { key: 'dtsRelation', n: '7а', text: 'q7a' },
  { key: 'dtsRelationPriceInfluence', n: '7б', text: 'q7b', relation: true },
  { key: 'dtsRelationApproxValue', n: '7в', text: 'q7c', relation: true },
  { key: 'dtsRestriction', n: '8а', text: 'q8a' },
  { key: 'dtsValueCondition', n: '8б', text: 'q8b' },
  { key: 'dtsRoyaltyFee', n: '9а', text: 'q9a' },
  { key: 'dtsSubsequentResale', n: '9б', text: 'q9b' },
  { key: 'dtsRoyaltyContract', n: '9', text: 'q9xml', xmlOnly: true },
]
const options = computed(() => [
  { value: 'yes', label: tq('yes') },
  { value: 'no', label: tq('no') },
])
const off = (q: (typeof QUESTIONS)[number]) => props.readonly || (!!q.relation && !props.form.dtsRelation)

const answer = (key: QuestionKey, v: ZOptionValue) => {
  const yes = v === 'yes'
  props.form[key] = yes
  if (key === 'dtsRelation' && !yes) {
    props.form.dtsRelationPriceInfluence = false
    props.form.dtsRelationApproxValue = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-1" data-dts-questions>
    <h3 class="m-0 mb-1 flex items-baseline gap-2 text-[14px] font-semibold text-ink">
      {{ tq('title') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '7–9' }) }}</span>
    </h3>
    <div
      v-for="q in QUESTIONS"
      :key="q.key"
      :class="cn('flex items-center gap-3 border-b border-line py-2.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-2', off(q) && !readonly && 'opacity-55')"
      :data-dts-question="q.key"
    >
      <div class="flex min-w-0 flex-1 items-baseline gap-3">
        <span class="w-6 shrink-0 font-mono text-[13px] text-muted">{{ q.n }}</span>
        <span :id="`dts-q-${q.key}`" class="min-w-0 text-sm text-ink">
          {{ tq(q.text) }}
          <ZTag v-if="q.xmlOnly" size="sm" class="ml-1.5 align-middle">{{ tq('xmlOnly') }}</ZTag>
        </span>
      </div>
      <ZSegmented
        :value="form[q.key] ? 'yes' : 'no'"
        :options="options"
        :disabled="off(q)"
        :aria-labelledby="`dts-q-${q.key}`"
        class="shrink-0 max-sm:self-start"
        @change="answer(q.key, $event)"
      />
    </div>
    <p class="m-0 mt-1.5 text-xs text-muted" data-dts-questions-note>{{ tq('note') }}</p>

    <ZField v-if="form.dtsFreeOfCharge" class="mt-4 max-w-2xl" :label="tq('reason')" :extra="tq('reasonHint')" data-graph="ДТС" data-goods-field="dtsReason" data-dts-reason>
      <ZTextarea
        :value="form.dtsMethodReason ?? ''"
        :rows="3"
        auto-grow
        :disabled="readonly"
        @update:value="form.dtsMethodReason = $event || null"
      />
    </ZField>
  </section>
</template>
