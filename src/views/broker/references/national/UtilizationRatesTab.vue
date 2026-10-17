<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { nationalListsApi, type UtilizationRates } from '@/api/nationalLists'
import { formatMoney } from '@/ui/number'
import { safeUrl } from '@/views/references/regulations'
import { utilizationCategory } from '@/utils/utilizationFee'
import { bandText, d, P } from './national'

// Вкладка «Утильсбор»: платёж оператору РОП = 50 МРП года × коэффициент приложения 4 (коэф. 1 — РК и ввоз не из РБ/РФ,
// коэф. 2 — из РБ или РФ). Текст приложения из облака не открывался — у каждого коэффициента отметка: «сверено» (сумма
// считается в КП и себестоимости), «не сверено» (только оценка), «—» (значения нет). МРП — по годам.
const { t } = useI18n()
const tu = (key: string, p?: Record<string, unknown>) => t(`${P}.util.${key}`, p ?? {})

const state = ref<'loading' | 'ready' | 'error'>('loading')
const rates = ref<UtilizationRates | null>(null)
const load = async () => {
  state.value = 'loading'
  try {
    rates.value = await nationalListsApi.utilizationRates()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const coef = (v: number | null) => (v == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-util-rates>
    <div v-if="state === 'error'" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-util-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ tu('loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-util-retry @click="load">{{ t(`${P}.retry`) }}</ZButton>
    </div>
    <div v-else-if="state === 'loading'" class="rounded-panel border border-line bg-surface p-5"><ZSkeleton :lines="6" height="18px" /></div>
    <template v-else-if="rates">
      <section class="flex flex-col gap-1.5 rounded-panel border border-line bg-surface px-4 py-3.5 sm:px-5" data-util-act>
        <p class="m-0 text-[13px] leading-5 [overflow-wrap:anywhere]">
          <a
            :href="safeUrl(rates.actUrl) ?? undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-field font-medium text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus"
          >{{ rates.act }}<PhArrowSquareOut :size="13" class="ml-1 inline-block align-[-2px]" aria-hidden="true" /><span class="sr-only"> ({{ t(`${P}.opensInNewTab`) }})</span></a>
        </p>
        <p class="m-0 text-sm text-ink" data-util-formula>{{ tu('formula', { mrp: rates.baseMrp, from: d(rates.effectiveFrom) }) }}</p>
        <p class="m-0 text-xs text-muted" data-util-mrp>
          {{ tu('mrp') }} {{ rates.mrp.map((m) => `${m.year} — ${formatMoney(m.value)}`).join(' · ') }}
        </p>
        <p class="m-0 text-[13px] leading-5 text-gold-ink" data-util-caveat>{{ tu('caveat') }}</p>
      </section>

      <ul role="list" class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="(r, i) in rates.rows" :key="i" class="min-w-0 rounded-row border border-line bg-surface px-3.5 py-2.5" :data-util-row="r.category">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span class="text-sm font-semibold text-ink">{{ utilizationCategory(t, r.category) }} <span class="font-normal text-ink-2">· {{ bandText(t, r) }}</span></span>
          </div>
          <dl class="m-0 mt-1.5 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            <div class="flex flex-wrap items-center gap-2">
              <dt class="text-ink-3">{{ tu('coef1') }}</dt>
              <dd class="m-0 font-semibold text-ink tabular-nums" data-util-coef1>{{ coef(r.coef1) }}</dd>
              <ZTag v-if="r.coef1 != null" :tone="r.verified1 ? 'done' : 'wait'" size="sm">{{ tu(r.verified1 ? 'verified' : 'unverified') }}</ZTag>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <dt class="text-ink-3">{{ tu('coef2') }}</dt>
              <dd class="m-0 font-semibold text-ink tabular-nums" data-util-coef2>{{ coef(r.coef2) }}</dd>
              <ZTag v-if="r.coef2 != null" :tone="r.verified2 ? 'done' : 'wait'" size="sm">{{ tu(r.verified2 ? 'verified' : 'unverified') }}</ZTag>
            </div>
          </dl>
          <p v-if="r.note" class="m-0 mt-1 text-xs leading-5 text-muted [overflow-wrap:anywhere]">{{ r.note }}</p>
        </li>
      </ul>
    </template>
  </div>
</template>
