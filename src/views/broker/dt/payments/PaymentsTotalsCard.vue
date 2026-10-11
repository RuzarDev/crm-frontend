<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { formatNumberIn } from '@/ui/number'
import type { DtFormState } from '../dtPayload'
import type { DtPayments } from '../useDtPayments'
import { grandTotal, totalsByMode, type PaymentModeTotal } from './paymentsModel'
import { useModeLabel } from './useModeLabel'

// «Итого по видам» (доска DtPayments): на ≥ 1280 — правая колонка страницы вместо «До подачи», уже — в разделе над
// фактическими платежами. С предпросмотром — итоги, которые «Записать» внесёт в гр. В (Σ гр. 47 после записи), кнопка
// «Записать в гр. 47 и гр. В» и что станет с гр. В (удалим виды, которых больше нет в расчёте; несколько строк вида —
// не тронем). Без предпросмотра (и при устаревшем) — Σ записанной гр. 47 по видам (как печать ДТ). Суммы — без копеек.
const props = defineProps<{
  form: DtFormState
  payments: DtPayments
  /** Право править: без него нет «Записать». */
  editable: boolean
}>()
const { t, locale } = useI18n()
const tt = (key: string, p?: Record<string, unknown>) => t(`broker.dt.payments.totals.${key}`, p ?? {})
const modeLabel = useModeLabel()

// Живой предпросмотр — итоги расчёта; устаревший ('stale-preview') — записанная гр. 47 и пометка «расчёт устарел»,
// без «Записать» и списка удаляемых видов (они относились к прежним данным).
const preview = computed(() => !!props.payments.result.value && (props.payments.state.value === 'preview' || props.payments.state.value === 'applying'))
const outdated = computed(() => props.payments.state.value === 'stale-preview')
const rows = computed<PaymentModeTotal[]>(() =>
  (preview.value ? props.payments.previewTotals.value : totalsByMode(props.form.goodsItems).filter((x) => x.code)))
const grand = computed(() => grandTotal(rows.value))
const merge = computed(() => props.payments.factPreview.value)
const money0 = (n: number) => formatNumberIn(String(locale.value), n, 0)
</script>

<template>
  <section class="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 sm:p-5" data-payments-totals :data-preview="preview ? '' : undefined">
    <div class="flex items-center gap-2">
      <h3 class="m-0 text-[14px] font-semibold text-ink">{{ tt('title') }}</h3>
      <ZTag v-if="preview" tone="info" size="sm" class="ml-auto" data-payments-totals-preview>{{ tt('preview') }}</ZTag>
    </div>

    <p v-if="outdated" class="m-0 text-[13px] text-gold-ink" data-payments-totals-outdated>{{ tt('outdated') }}</p>

    <p v-if="!rows.length" class="m-0 text-[13px] text-muted" data-payments-totals-empty>{{ editable ? tt('empty') : tt('emptyView') }}</p>
    <dl v-else class="m-0 flex flex-col">
      <div
        v-for="row in rows"
        :key="row.code"
        class="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[13px] last:border-b-0"
        :data-payments-total="row.code"
      >
        <dt class="min-w-0 text-ink-2"><span class="font-mono text-muted">{{ row.code }}</span> {{ modeLabel(row.code) }}</dt>
        <dd class="m-0 whitespace-nowrap tabular-nums text-ink">{{ money0(row.amount) }} ₸</dd>
      </div>
    </dl>

    <div v-if="rows.length" class="flex items-baseline justify-between gap-3 border-t border-line-strong pt-3" data-payments-grand>
      <span class="text-[13px] font-semibold text-ink">{{ tt('grand') }}</span>
      <span class="text-lg font-semibold whitespace-nowrap tabular-nums text-ink">{{ money0(grand) }} ₸</span>
    </div>

    <template v-if="preview && editable">
      <ZButton
        variant="primary"
        class="self-start max-sm:h-11"
        :loading="payments.applying.value"
        :disabled="payments.state.value !== 'preview'"
        data-payments-apply
        @click="payments.apply()"
      >
        <PhCheck :size="16" aria-hidden="true" />{{ t('broker.dt.payments.apply') }}
      </ZButton>
      <p class="m-0 text-xs text-muted" data-payments-remove-note>{{ tt('removeNote') }}</p>
      <p v-if="merge?.removed.length" class="m-0 text-[13px] text-ink-2" data-payments-removed>
        {{ tt('removed', { codes: merge.removed.join(', ') }) }}
      </p>
      <p v-for="code in merge?.multiple ?? []" :key="code" class="m-0 text-[13px] text-gold-ink" :data-payments-multiple="code">
        {{ tt('multiple', { code }) }}
      </p>
    </template>
  </section>
</template>
