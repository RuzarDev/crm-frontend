<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { foreignContractsApi, type ForeignContract } from '@/api/foreignContracts'
import type { Import40Doc44ItemInput } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import { message } from '@/ui/message'
import { applyContractToDoc44, contractLabel, money } from './contracts'

// Внешнеторговый контракт ДТ (17.10), над гр.44: контракт как у заявки или свой (одна заявка — несколько контрактов),
// и «Заполнить из контракта» — гр.44 03011 (номер и дата контракта) и 03031 (УНК). Сверку ДТ с контрактом (валюта,
// остаток, срок) показывает готовность ДТ — предупреждениями.
const props = defineProps<{
  doc44Items: Import40Doc44ItemInput[]
  caseId: string
  dtId: string
  clientId: string
  caseContractId: string | null
  dtContractId: string | null
  /** Менять контракт ДТ (декларант). */
  canLink: boolean
  /** Форма ДТ только для чтения — гр.44 не заполняем. */
  readonly: boolean
}>()
const { t, locale } = useI18n()
const classifiers = useClassifiersStore()

const contracts = shallowRef<ForeignContract[]>([])
const own = ref<string | null>(props.dtContractId)
watch(() => props.dtContractId, (v) => { own.value = v })
const loaded = ref(false)
const load = async () => {
  try {
    contracts.value = await foreignContractsApi.list(props.clientId, { includeArchived: true, silent: true })
  } catch { contracts.value = [] } finally { loaded.value = true }
}
watch(() => props.clientId, (v) => { if (v) void load() }, { immediate: true })

const byId = (id: string | null) => (id ? contracts.value.find((c) => c.id === id) ?? null : null)
const caseContract = computed(() => byId(props.caseContractId))
const effective = computed(() => byId(own.value ?? props.caseContractId))

const AS_CASE = '__case__'
const options = computed(() => [
  { value: AS_CASE, label: caseContract.value ? t('foreignContracts.dt.asCase', { label: contractLabel(caseContract.value, t) }) : t('foreignContracts.dt.asCaseNone') },
  ...contracts.value.filter((c) => (!c.isArchived || c.id === own.value) && c.id !== props.caseContractId)
    .map((c) => ({ value: c.id, label: contractLabel(c, t) })),
])
const saving = ref(false)
const onChange = async (v: unknown) => {
  const id = typeof v === 'string' && v !== AS_CASE ? v : null
  if (id === own.value) return
  saving.value = true
  try {
    const res = await foreignContractsApi.linkDeclaration(props.caseId, props.dtId, id)
    own.value = res.foreignContractId
    message.success(t('foreignContracts.dt.linked'))
  } catch { /* общий перехватчик */ } finally {
    saving.value = false
  }
}

const fill = () => {
  const c = effective.value
  if (!c || props.readonly) return
  const names = classifiers.cache['2009'] ?? []
  const n = applyContractToDoc44(props.doc44Items, c, (code) => names.find((x) => x.code === code)?.nameRu ?? null, () => ({
    docTypeCode: null, docTypeName: null, docNumber: null, docDate: null, goodsItemIndex: null, appliesToAll: true,
    goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0',
  }))
  message.success(n ? t('foreignContracts.dt.filled', { n }) : t('foreignContracts.dt.alreadyFilled'))
}
const href = computed(() => (effective.value
  ? `/clients/${encodeURIComponent(props.clientId)}/contracts/${encodeURIComponent(effective.value.id)}` : ''))
</script>

<template>
  <div v-if="loaded && (contracts.length || caseContractId)" class="flex flex-col gap-2 rounded-row border border-solid border-line px-4 py-3" data-dt-contract>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="text-sm font-semibold text-ink">{{ t('foreignContracts.dt.title') }}</span>
      <ZSelect
        v-if="canLink"
        :value="own ?? AS_CASE"
        :options="options"
        :disabled="saving"
        :loading="saving"
        :aria-label="t('foreignContracts.dt.title')"
        class="w-full max-sm:h-11 sm:w-[420px]"
        data-dt-contract-select
        @update:value="onChange"
      />
      <span v-else class="text-sm text-ink-2">{{ effective ? contractLabel(effective, t) : t('foreignContracts.case.notLinked') }}</span>
    </div>
    <div v-if="effective" class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
      <RouterLink :to="href" class="font-medium text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11 max-sm:content-center" data-dt-contract-link>
        {{ t('foreignContracts.remainingOf', { remaining: money(locale, effective.balance.remaining, effective.currency), amount: money(locale, effective.amount, effective.currency) }) }}
      </RouterLink>
      <ZButton v-if="!readonly" size="sm" class="max-sm:h-11 max-sm:w-full sm:ml-auto" data-dt-contract-fill @click="fill">
        <template #icon><PhArrowsClockwise :size="14" aria-hidden="true" /></template>
        {{ effective.unkNumber ? t('foreignContracts.dt.fillBoth') : t('foreignContracts.dt.fillContract') }}
      </ZButton>
    </div>
  </div>
</template>
