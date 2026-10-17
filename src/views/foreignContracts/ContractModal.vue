<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import type { ZOption } from '@/ui/options'
import type { ForeignContractFields } from '@/api/foreignContracts'
import { fieldErrors as serverFieldErrors } from '@/api/nationalLists'
import { clientRegistryApi, type RegistryDocument } from '@/api/clientRegistry'
import { referencesApi } from '@/api/references'
import { tnvedApi } from '@/api/tnved'
import { buildCountryOptions, filterCountryOption } from '@/utils/countries'
import { message } from '@/ui/message'
import { day, emptyFields, fieldErrors, type ContractField } from './contracts'

// Окно внешнеторгового контракта: основное (номер, дата, поставщик, валюта и сумма, срок, Инкотермс, оплата),
// валютный контроль (срок репатриации, УНК и срок его снятия) и файлы из реестра документов клиента.
// Ошибки полей — свои (те же правила, что на сервере) и серверные (400 с errors); окно не закрывается при ошибке.
const props = withDefaults(defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  clientId: string
  initial?: ForeignContractFields | null
  save: (fields: ForeignContractFields) => Promise<void>
}>(), { initial: null })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']

const fields = ref<ForeignContractFields>(emptyFields())
const touched = ref(false)
const saving = ref(false)
const serverErrors = ref<Record<string, string>>({})

// ---- Справочники: валюты НБ РК, страны, документы реестра клиента ----
const currencyOptions = shallowRef<ZOption[]>([{ value: 'KZT', label: 'KZT' }])
const countryOptions = shallowRef<ReturnType<typeof buildCountryOptions>>([])
const registryDocs = shallowRef<RegistryDocument[]>([])
let refsLoaded = false
const loadRefs = async () => {
  const [cur, countries] = await Promise.allSettled([
    refsLoaded ? Promise.resolve(null) : tnvedApi.currencies(),
    refsLoaded ? Promise.resolve(null) : referencesApi.listCountries({ silent: true }),
  ])
  if (cur.status === 'fulfilled' && cur.value) {
    currencyOptions.value = [
      ...cur.value.data.map((c) => ({ value: c.codeLat, label: `${c.codeLat} — ${c.name}` })),
      { value: 'KZT', label: 'KZT' },
    ]
  }
  if (countries.status === 'fulfilled' && countries.value) countryOptions.value = buildCountryOptions(countries.value)
  refsLoaded = cur.status === 'fulfilled' && countries.status === 'fulfilled'
  try {
    registryDocs.value = await clientRegistryApi.list(props.clientId, { silent: true })
  } catch { registryDocs.value = [] }
}
const docOptions = (category: 'supplyContract' | 'unk', selected: string | null): ZOption[] => registryDocs.value
  .filter((d) => d.category === category && (!d.isArchived || d.id === selected))
  .map((d) => ({
    value: d.id,
    label: `${d.number || d.title || '—'}${d.issuedOn ? ` · ${day(d.issuedOn)}` : ''} · ${t('foreignContracts.form.files', { n: d.files.length })}`,
  }))
watch(() => props.open, (v) => {
  if (!v) return
  fields.value = { ...(props.initial ?? emptyFields()) }
  touched.value = false
  serverErrors.value = {}
  void loadRefs()
}, { immediate: true })
const contractDocOptions = computed(() => docOptions('supplyContract', fields.value.contractDocumentId))
const unkDocOptions = computed(() => docOptions('unk', fields.value.unkDocumentId))
const incotermsOptions = INCOTERMS.map((c) => ({ value: c, label: c }))

const localErrors = computed(() => (touched.value ? fieldErrors(fields.value) : {}))
const err = (f: ContractField): string | undefined => {
  const local = localErrors.value[f]
  return local ? t(local) : serverErrors.value[f]
}
const hasUnk = computed(() => !!fields.value.unkNumber.trim())
// УНК стёрли — поля УНК (выключены) очищаются: иначе их нельзя ни поправить, ни сохранить контракт.
watch(hasUnk, (v) => {
  if (v) return
  Object.assign(fields.value, { unkDate: null, unkBank: '', unkRemovalDeadline: null, unkRemovedOn: null })
})
const title = computed(() => t(props.mode === 'edit' ? 'foreignContracts.form.editTitle' : 'foreignContracts.form.createTitle'))

const submit = async () => {
  if (saving.value) return
  touched.value = true
  serverErrors.value = {}
  if (Object.keys(fieldErrors(fields.value)).length) return
  saving.value = true
  try {
    await props.save({ ...fields.value })
    emit('update:open', false)
  } catch (e) {
    const fe = serverFieldErrors(e)
    serverErrors.value = fe
    if (!Object.keys(fe).length) {
      const text = (e as { response?: { status?: number; data?: { error?: string } } })?.response
      if (text?.status === 400) message.error(text.data?.error || t('foreignContracts.saveError'))
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="title"
    :width="680"
    :ok-text="t('foreignContracts.form.save')"
    :cancel-text="t('foreignContracts.form.cancel')"
    :confirm-loading="saving"
    destroy-on-close
    data-contract-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-5 pb-2" novalidate @submit.prevent="submit">
      <fieldset class="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
        <legend class="mb-2 p-0 text-sm font-semibold text-ink">{{ t('foreignContracts.form.main') }}</legend>
        <ZField :label="t('foreignContracts.field.number')" required :error="err('number')">
          <ZInput v-model:value="fields.number" mono :maxlength="100" class="max-sm:h-11" data-contract-number />
        </ZField>
        <ZField :label="t('foreignContracts.field.contractDate')" required :error="err('contractDate')">
          <ZDate v-model:value="fields.contractDate" class="max-sm:h-11" data-contract-date />
        </ZField>
        <ZField :label="t('foreignContracts.field.supplierName')" required :error="err('supplierName')" class="sm:col-span-2">
          <ZInput v-model:value="fields.supplierName" :maxlength="300" class="max-sm:h-11" data-contract-supplier />
        </ZField>
        <ZField :label="t('foreignContracts.field.supplierCountry')" required :error="err('supplierCountryCode')">
          <ZSelect
            :value="fields.supplierCountryCode"
            :options="countryOptions"
            show-search
            :filter-option="filterCountryOption"
            :placeholder="t('foreignContracts.form.countryPh')"
            class="max-sm:h-11"
            data-contract-country
            @update:value="fields.supplierCountryCode = ($event as string | null) ?? null"
          />
        </ZField>
        <ZField :label="t('foreignContracts.field.validUntil')" :error="err('validUntil')" :help="err('validUntil') ? undefined : t('foreignContracts.form.validUntilHelp')">
          <ZDate v-model:value="fields.validUntil" :min="fields.contractDate ?? undefined" class="max-sm:h-11" data-contract-until />
        </ZField>
        <ZField :label="t('foreignContracts.field.amount')" required :error="err('amount') ?? err('currency')" class="sm:col-span-2">
          <div class="flex w-full gap-2">
            <ZNumber v-model:value="fields.amount" :min="0" :precision="2" class="min-w-0 flex-1 max-sm:h-11" data-contract-amount />
            <ZSelect
              :value="fields.currency"
              :options="currencyOptions"
              show-search
              :placeholder="t('foreignContracts.form.currencyPh')"
              :popup-width="280"
              :aria-label="t('foreignContracts.field.currency')"
              :status="err('currency') ? 'error' : ''"
              class="w-[120px] shrink-0 max-sm:h-11"
              data-contract-currency
              @update:value="fields.currency = ($event as string | null) ?? null"
            />
          </div>
        </ZField>
        <ZField :label="t('foreignContracts.field.incoterms')">
          <div class="flex w-full gap-2">
            <ZSelect
              :value="fields.incoterms"
              :options="incotermsOptions"
              allow-clear
              :aria-label="t('foreignContracts.field.incoterms')"
              class="w-[104px] shrink-0 max-sm:h-11"
              data-contract-incoterms
              @update:value="fields.incoterms = ($event as string | null) ?? null"
            />
            <ZInput
              v-model:value="fields.incotermsPlace"
              :maxlength="300"
              :placeholder="t('foreignContracts.form.placePh')"
              :aria-label="t('foreignContracts.field.incotermsPlace')"
              class="min-w-0 flex-1 max-sm:h-11"
              data-contract-place
            />
          </div>
        </ZField>
        <ZField :label="t('foreignContracts.field.paymentTerms')">
          <ZInput v-model:value="fields.paymentTerms" :maxlength="1000" :placeholder="t('foreignContracts.form.paymentTermsPh')" class="max-sm:h-11" data-contract-payment-terms />
        </ZField>
      </fieldset>

      <fieldset class="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
        <legend class="mb-1 p-0 text-sm font-semibold text-ink">{{ t('foreignContracts.form.currencyControl') }}</legend>
        <p class="m-0 text-[13px] text-ink-3 sm:col-span-2">{{ t('foreignContracts.form.currencyControlHint') }}</p>
        <ZField :label="t('foreignContracts.field.repatriationDeadline')" :error="err('repatriationDeadline')" class="sm:col-span-2">
          <ZDate v-model:value="fields.repatriationDeadline" :min="fields.contractDate ?? undefined" class="max-sm:h-11 sm:max-w-[calc(50%-8px)]" data-contract-repatriation />
        </ZField>
        <ZField :label="t('foreignContracts.field.unkNumber')" :error="err('unkNumber')" :help="t('foreignContracts.form.unkHelp')">
          <ZInput v-model:value="fields.unkNumber" mono :maxlength="50" class="max-sm:h-11" data-contract-unk />
        </ZField>
        <ZField :label="t('foreignContracts.field.unkDate')">
          <ZDate v-model:value="fields.unkDate" :disabled="!hasUnk" class="max-sm:h-11" data-contract-unk-date />
        </ZField>
        <ZField :label="t('foreignContracts.field.unkBank')" class="sm:col-span-2">
          <ZInput v-model:value="fields.unkBank" :maxlength="300" :disabled="!hasUnk" class="max-sm:h-11" data-contract-unk-bank />
        </ZField>
        <ZField :label="t('foreignContracts.field.unkRemovalDeadline')" :error="err('unkRemovalDeadline')">
          <ZDate v-model:value="fields.unkRemovalDeadline" :disabled="!hasUnk" class="max-sm:h-11" data-contract-unk-deadline />
        </ZField>
        <ZField :label="t('foreignContracts.field.unkRemovedOn')" :error="err('unkRemovedOn')">
          <ZDate v-model:value="fields.unkRemovedOn" :disabled="!hasUnk" class="max-sm:h-11" data-contract-unk-removed />
        </ZField>
      </fieldset>

      <fieldset class="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
        <legend class="mb-1 p-0 text-sm font-semibold text-ink">{{ t('foreignContracts.form.filesTitle') }}</legend>
        <p class="m-0 text-[13px] text-ink-3 sm:col-span-2">{{ t('foreignContracts.form.filesHint') }}</p>
        <ZField :label="t('foreignContracts.field.contractDocument')" :error="err('contractDocumentId')">
          <ZSelect
            :value="fields.contractDocumentId"
            :options="contractDocOptions"
            allow-clear
            :placeholder="t('foreignContracts.form.notSelected')"
            :not-found-content="t('foreignContracts.form.noRegistryDocs')"
            class="max-sm:h-11"
            data-contract-doc
            @update:value="fields.contractDocumentId = ($event as string | null) ?? null"
          />
        </ZField>
        <ZField :label="t('foreignContracts.field.unkDocument')" :error="err('unkDocumentId')">
          <ZSelect
            :value="fields.unkDocumentId"
            :options="unkDocOptions"
            allow-clear
            :placeholder="t('foreignContracts.form.notSelected')"
            :not-found-content="t('foreignContracts.form.noRegistryDocs')"
            class="max-sm:h-11"
            data-contract-unk-doc
            @update:value="fields.unkDocumentId = ($event as string | null) ?? null"
          />
        </ZField>
        <ZField :label="t('foreignContracts.field.note')" class="sm:col-span-2">
          <ZTextarea v-model:value="fields.note" :rows="2" :maxlength="1000" data-contract-note />
        </ZField>
      </fieldset>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
