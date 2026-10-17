<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhWarning } from '@phosphor-icons/vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { foreignContractsApi, type CaseContractCheck, type ForeignContract } from '@/api/foreignContracts'
import { message } from '@/ui/message'
import { checkText, contractLabel, money } from './contracts'

// Внешнеторговый контракт заявки (17.10): выбор из контрактов клиента, остаток и сверка ДТ заявки с контрактом
// (валюта, остаток, срок — только предупреждения). В карточке заявки сотрудника и в карточке поставки клиента.
// canEdit — менять контракт (клиент — пока заявка не закрыта, сотрудник Импорта 40); href — ссылка на карточку контракта.
const props = defineProps<{ caseId: string; clientId: string; canEdit: boolean; href: (id: string) => string; compact?: boolean }>()
const { t, locale } = useI18n()

const check = shallowRef<CaseContractCheck | null>(null)
const contracts = shallowRef<ForeignContract[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const saving = ref(false)
let seq = 0
const load = async () => {
  const my = ++seq
  try {
    const [c, list] = await Promise.all([
      foreignContractsApi.caseCheck(props.caseId),
      props.canEdit ? foreignContractsApi.list(props.clientId, { silent: true }) : Promise.resolve([] as ForeignContract[]),
    ])
    if (my !== seq) return
    check.value = c
    contracts.value = list
    state.value = 'ready'
  } catch {
    if (my === seq) state.value = 'error'
  }
}
watch(() => props.caseId, () => { void load() }, { immediate: true })

const current = computed(() => check.value?.contract ?? null)
const options = computed(() => {
  const list = contracts.value.filter((c) => !c.isArchived)
  const cur = current.value
  const all = cur && !list.some((c) => c.id === cur.id) ? [cur, ...list] : list
  return all.map((c) => ({ value: c.id, label: contractLabel(c, t) }))
})
const onChange = async (v: unknown) => {
  const id = typeof v === 'string' && v ? v : null
  if (id === (current.value?.id ?? null)) return
  saving.value = true
  try {
    check.value = await foreignContractsApi.linkCase(props.caseId, id)
    message.success(t(id ? 'foreignContracts.case.linked' : 'foreignContracts.case.unlinked'))
  } catch { /* общий перехватчик */ } finally {
    saving.value = false
  }
}
const checks = computed(() => {
  const c = current.value
  return c ? (check.value?.checks ?? []).map((ch) => checkText(ch, c, t, locale.value)) : []
})
</script>

<template>
  <section :class="compact ? 'flex flex-col gap-2' : 'flex flex-col gap-2 rounded-panel border border-line bg-surface px-[18px] py-4'" aria-labelledby="case-contract-title" data-case-contract>
    <h3 id="case-contract-title" class="m-0 text-sm font-semibold text-ink">{{ t('foreignContracts.case.title') }}</h3>
    <p v-if="state === 'error'" class="m-0 text-[13px] text-ink-3" data-case-contract-error>
      {{ t('foreignContracts.loadError') }}
      <button type="button" class="ml-1 cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] font-medium text-zircon-ink underline max-sm:min-h-11" @click="load">{{ t('foreignContracts.retry') }}</button>
    </p>
    <template v-else-if="state === 'ready'">
      <ZSelect
        v-if="canEdit"
        :value="current?.id ?? null"
        :options="options"
        allow-clear
        :disabled="saving"
        :loading="saving"
        :placeholder="t('foreignContracts.case.none')"
        :not-found-content="t('foreignContracts.case.noContracts')"
        :aria-label="t('foreignContracts.case.title')"
        class="w-full max-sm:h-11"
        data-case-contract-select
        @update:value="onChange"
      />
      <p v-else-if="!current" class="m-0 text-[13px] text-muted">{{ t('foreignContracts.case.notLinked') }}</p>
      <div v-if="current" class="flex flex-col gap-1 text-[13px]">
        <RouterLink :to="href(current.id)" class="w-fit font-medium break-words text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11 max-sm:content-center" data-case-contract-link>
          {{ contractLabel(current, t) }}
        </RouterLink>
        <span class="text-ink-2 tabular-nums" data-case-contract-remaining>
          {{ t('foreignContracts.remainingOf', { remaining: money(locale, current.balance.remaining, current.currency), amount: money(locale, current.amount, current.currency) }) }}
        </span>
      </div>
      <ul v-if="checks.length" role="list" class="m-0 flex list-none flex-col gap-1 p-0" data-case-contract-checks>
        <li v-for="(text, i) in checks" :key="i" class="flex items-start gap-1.5 text-[13px] text-gold-ink">
          <PhWarning :size="14" class="mt-0.5 shrink-0" aria-hidden="true" /><span class="min-w-0 [overflow-wrap:anywhere]">{{ text }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>
