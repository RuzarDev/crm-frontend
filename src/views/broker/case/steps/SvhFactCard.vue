<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhWarningCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import { formatMoney } from '@/ui/number'
import { whenText } from '@/utils/import40StageModel'
import type { CaseStepContext } from '../caseContext'
import SvhFactModal from './SvhFactModal.vue'

// «СВХ: факт» (21.10.2026, «Идеальный ВЭД» п.18/21): въезд/выезд, места и вес брутто по СВХ против ДТ заявки, сутки на
// СВХ, платные сутки и стоимость простоя, причина задержки. Вносят те, кто работает с СВХ (canBorderWork — как сервер);
// остальным — только чтение. Показывается в «Декларировании» и «СВХ и счёт».
const props = defineProps<{ ctx: CaseStepContext; readonly?: boolean }>()
const { t } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.case.svhFact.${key}`, p ?? {})

const fact = computed(() => props.ctx.kase.svhFact ?? null)
const canEdit = computed(() => !props.readonly && props.ctx.perms.canBorderWork && props.ctx.kase.status >= 1 && props.ctx.kase.status !== 9)
const open = ref(false)

const num = (v: number | null | undefined, digits = 3) =>
  v == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(v)
const stay = computed(() => {
  const f = fact.value
  if (!f?.enteredAtUtc) return ''
  const parts = [tx('entered', { at: whenText(f.enteredAtUtc, t) })]
  parts.push(f.leftAtUtc ? tx('left', { at: whenText(f.leftAtUtc, t) }) : tx('stillThere'))
  if (f.days != null) parts.push(tx('days', { n: f.days }))
  return parts.join(' · ')
})
const demurrage = computed(() => {
  const f = fact.value
  if (!f || f.paidDays == null) return ''
  const cost = f.demurrageKzt != null ? ` · ${formatMoney(Math.round(f.demurrageKzt))}` : ''
  return tx('paidDays', { n: f.paidDays, free: f.freeDays ?? 0 }) + cost
})
</script>

<template>
  <section class="flex flex-col gap-2 rounded-row border border-line bg-surface px-4 py-3" data-svh-fact>
    <div class="flex flex-wrap items-center gap-2">
      <h4 class="m-0 flex-1 text-sm font-semibold text-ink">{{ tx('title') }}</h4>
      <ZButton v-if="canEdit" variant="secondary" size="sm" class="max-sm:min-h-11" data-svh-fact-edit @click="open = true">
        {{ fact ? tx('edit') : tx('add') }}
      </ZButton>
    </div>
    <p v-if="!fact" class="m-0 text-[13px] text-muted" data-svh-fact-empty>{{ tx('empty') }}</p>
    <template v-else>
      <p v-if="stay" class="m-0 text-[13px] text-ink-2 tabular-nums" data-svh-fact-stay>{{ stay }}</p>
      <ul class="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
        <li v-if="fact.factPackages != null" :class="fact.packagesDiffer ? 'text-tone-wait-fg' : 'text-ink-2'" data-svh-fact-packages>
          <component :is="fact.packagesDiffer ? PhWarningCircle : PhCheckCircle" :size="14" class="mr-1 inline align-[-2px]" aria-hidden="true" />
          {{ tx('packages', { fact: num(fact.factPackages, 2), dt: num(fact.dtPackages, 2) }) }}<template v-if="fact.packagesDiffer"> — {{ tx('differs') }}</template>
        </li>
        <li v-if="fact.factGrossKg != null" :class="fact.weightDiffers ? 'text-tone-wait-fg' : 'text-ink-2'" data-svh-fact-weight>
          <component :is="fact.weightDiffers ? PhWarningCircle : PhCheckCircle" :size="14" class="mr-1 inline align-[-2px]" aria-hidden="true" />
          {{ tx('weight', { fact: num(fact.factGrossKg), dt: num(fact.dtGrossKg) }) }}<template v-if="fact.weightDiffers"> — {{ tx('differs') }}</template>
        </li>
        <li v-if="demurrage" class="text-ink-2 tabular-nums" data-svh-fact-demurrage>{{ demurrage }}</li>
        <li v-if="fact.delayReason" class="text-ink-2" data-svh-fact-reason>{{ tx('reasonLine', { reason: tx(`reason.${fact.delayReason}`) }) }}</li>
        <li v-if="fact.note" class="text-ink-3" data-svh-fact-note>{{ fact.note }}</li>
      </ul>
    </template>
    <SvhFactModal v-if="canEdit" v-model:open="open" :ctx="ctx" />
  </section>
</template>
