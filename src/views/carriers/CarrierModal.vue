<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import type { ZOption } from '@/ui/options'
import type { CarrierFields } from '@/api/carriers'
import { clientRegistryApi, type RegistryDocument } from '@/api/clientRegistry'
import { fieldErrors as serverFieldErrors } from '@/api/nationalLists'
import { referencesApi } from '@/api/references'
import { buildCountryOptions, filterCountryOption } from '@/utils/countries'
import { formatDay } from '@/views/broker/list'
import { message } from '@/ui/message'
import { carrierErrors, emptyCarrier, KZ_CODE, type CarrierField } from './carriers'

// Окно перевозчика: название, страна, БИН/ИИН или иностранный рег. номер, контакты и договор перевозки.
// Договор — документ реестра клиента «Договор перевозки»: выбрать уже загруженный или загрузить новый (номер, срок,
// файл) — тогда он сначала попадает в реестр (там срок и напоминания), а перевозчик ссылается на него.
const props = withDefaults(defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  clientId: string
  initial?: CarrierFields | null
  save: (fields: CarrierFields) => Promise<void>
}>(), { initial: null })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const fields = ref<CarrierFields>(emptyCarrier())
const touched = ref(false)
const saving = ref(false)
const serverErrors = ref<Record<string, string>>({})

// Договор: pick — из реестра, upload — новый документ в реестр.
const contractMode = ref<'pick' | 'upload'>('pick')
const newContract = ref({ number: '', validUntil: null as string | null, file: null as File | null })
const contractErr = ref<string | null>(null)

const countryOptions = shallowRef<ReturnType<typeof buildCountryOptions>>([])
const registryDocs = shallowRef<RegistryDocument[]>([])
const loadRefs = async () => {
  if (!countryOptions.value.length) {
    try { countryOptions.value = buildCountryOptions(await referencesApi.listCountries({ silent: true })) } catch { /* страна — кодом */ }
  }
  try {
    registryDocs.value = await clientRegistryApi.list(props.clientId, { silent: true })
  } catch { registryDocs.value = [] }
}
watch(() => props.open, (v) => {
  if (!v) return
  fields.value = { ...(props.initial ?? emptyCarrier()) }
  touched.value = false
  serverErrors.value = {}
  contractErr.value = null
  contractMode.value = 'pick'
  newContract.value = { number: '', validUntil: null, file: null }
  void loadRefs()
}, { immediate: true })

const contractOptions = computed<ZOption[]>(() => registryDocs.value
  .filter((d) => d.category === 'carriageContract' && (!d.isArchived || d.id === fields.value.contractDocumentId))
  .map((d) => ({
    value: d.id,
    label: `${d.number || d.title || '—'}${d.validUntil ? ` · ${t('carriers.until', { date: formatDay(d.validUntil) })}` : ''}`,
  })))
const modeOptions = computed(() => [
  { value: 'pick', label: t('carriers.form.contractPick') },
  { value: 'upload', label: t('carriers.form.contractUpload') },
])

const localErrors = computed(() => (touched.value ? carrierErrors(fields.value) : {}))
const err = (f: CarrierField): string | undefined => {
  const local = localErrors.value[f]
  return local ? t(local) : serverErrors.value[f]
}
const isKz = computed(() => fields.value.countryCode === KZ_CODE)
const title = computed(() => t(props.mode === 'edit' ? 'carriers.form.editTitle' : 'carriers.form.createTitle'))

/** Новый договор в реестр: null — ничего не введено (договор не меняется); false — не хватает номера или файла. */
const uploadContract = async (): Promise<string | null | false> => {
  const n = newContract.value
  if (!n.number.trim() && !n.file) return null
  if (!n.number.trim() || !n.file) {
    contractErr.value = t('carriers.form.contractNeedBoth')
    return false
  }
  const doc = await clientRegistryApi.create(props.clientId, {
    category: 'carriageContract', title: '', number: n.number.trim(), issuedOn: null, validUntil: n.validUntil,
    counterparty: fields.value.name.trim(), tnvedCodes: '', note: '',
  }, [n.file])
  registryDocs.value = [...registryDocs.value, doc]
  contractMode.value = 'pick'
  newContract.value = { number: '', validUntil: null, file: null }
  return doc.id
}

const submit = async () => {
  if (saving.value) return
  touched.value = true
  serverErrors.value = {}
  contractErr.value = null
  if (Object.keys(carrierErrors(fields.value)).length) return
  saving.value = true
  try {
    if (contractMode.value === 'upload') {
      const id = await uploadContract()
      if (id === false) return
      if (id) fields.value.contractDocumentId = id
    }
    await props.save({ ...fields.value })
    emit('update:open', false)
  } catch (e) {
    const fe = serverFieldErrors(e)
    serverErrors.value = fe
    if (!Object.keys(fe).length) {
      const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
      if (res?.status === 400) message.error(res.data?.error || t('carriers.saveError'))
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
    :width="640"
    :ok-text="t('carriers.form.save')"
    :cancel-text="t('carriers.form.cancel')"
    :confirm-loading="saving"
    destroy-on-close
    data-carrier-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-5 pb-2" novalidate @submit.prevent="submit">
      <fieldset class="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
        <legend class="mb-2 p-0 text-sm font-semibold text-ink">{{ t('carriers.form.main') }}</legend>
        <ZField :label="t('carriers.field.name')" required :error="err('name')" class="sm:col-span-2">
          <ZInput v-model:value="fields.name" :maxlength="300" class="max-sm:h-11" data-carrier-name />
        </ZField>
        <ZField :label="t('carriers.field.country')" required :error="err('countryCode')">
          <ZSelect
            :value="fields.countryCode"
            :options="countryOptions"
            show-search
            :filter-option="filterCountryOption"
            :placeholder="t('carriers.form.countryPh')"
            class="max-sm:h-11"
            data-carrier-country
            @update:value="fields.countryCode = ($event as string | null) ?? null"
          />
        </ZField>
        <ZField :label="t(isKz ? 'carriers.field.bin' : 'carriers.field.regNumber')" :error="err('regNumber')">
          <ZInput v-model:value="fields.regNumber" mono :maxlength="isKz ? 12 : 50" class="max-sm:h-11" data-carrier-reg />
        </ZField>
      </fieldset>

      <fieldset class="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
        <legend class="mb-2 p-0 text-sm font-semibold text-ink">{{ t('carriers.form.contacts') }}</legend>
        <ZField :label="t('carriers.field.contactName')" :error="err('contactName')">
          <ZInput v-model:value="fields.contactName" :maxlength="300" class="max-sm:h-11" data-carrier-contact />
        </ZField>
        <ZField :label="t('carriers.field.phone')" :error="err('phone')">
          <ZInput v-model:value="fields.phone" type="tel" :maxlength="50" class="max-sm:h-11" data-carrier-phone />
        </ZField>
        <ZField :label="t('carriers.field.email')" :error="err('email')">
          <ZInput v-model:value="fields.email" type="email" :maxlength="200" class="max-sm:h-11" data-carrier-email />
        </ZField>
        <ZField :label="t('carriers.field.address')" :error="err('address')">
          <ZInput v-model:value="fields.address" :maxlength="1000" class="max-sm:h-11" data-carrier-address />
        </ZField>
      </fieldset>

      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        <legend class="mb-1 p-0 text-sm font-semibold text-ink">{{ t('carriers.form.contractTitle') }}</legend>
        <p class="m-0 text-[13px] text-ink-3">{{ t('carriers.form.contractHint') }}</p>
        <ZSegmented
          :value="contractMode"
          :options="modeOptions"
          :aria-label="t('carriers.form.contractTitle')"
          class="w-full sm:w-fit"
          data-carrier-contract-mode
          @update:value="contractMode = $event as 'pick' | 'upload'"
        />
        <ZField v-if="contractMode === 'pick'" :label="t('carriers.field.contract')" :error="err('contractDocumentId')">
          <ZSelect
            :value="fields.contractDocumentId"
            :options="contractOptions"
            allow-clear
            :placeholder="t('carriers.form.notSelected')"
            :not-found-content="t('carriers.form.noContracts')"
            class="max-sm:h-11"
            data-carrier-contract
            @update:value="fields.contractDocumentId = ($event as string | null) ?? null"
          />
        </ZField>
        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2" data-carrier-contract-new>
          <ZField :label="t('carriers.field.contractNumber')" :error="contractErr ?? undefined">
            <ZInput v-model:value="newContract.number" mono :maxlength="100" class="max-sm:h-11" data-carrier-contract-number />
          </ZField>
          <ZField :label="t('carriers.field.contractUntil')" :help="t('carriers.form.untilHelp')">
            <ZDate v-model:value="newContract.validUntil" class="max-sm:h-11" data-carrier-contract-until />
          </ZField>
          <div class="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2">
            <ZUpload :accept="ACCEPT" :max-size-mb="25" class="max-sm:w-full" data-carrier-contract-file @select="newContract.file = $event[0] ?? null">
              {{ t('carriers.form.chooseFile') }}
            </ZUpload>
            <span v-if="newContract.file" class="min-w-0 text-sm break-all text-ink-2">{{ newContract.file.name }}</span>
          </div>
        </div>
      </fieldset>

      <ZField :label="t('carriers.field.note')">
        <ZTextarea v-model:value="fields.note" :rows="2" :maxlength="1000" data-carrier-note />
      </ZField>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
