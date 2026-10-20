<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhPencilSimple, PhTrash, PhWarning } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { carriersApi, type CargoInsurance, type CargoInsuranceFields, type CarrierInvoice } from '@/api/carriers'
import { fieldErrors as serverFieldErrors } from '@/api/nationalLists'
import { saveBlob } from '@/ui/download'
import { formatMoneyIn, formatNumberIn } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { formatDay } from '@/views/broker/list'
import { emptyInsurance, hasInsurance, insuranceErrors, insuranceFieldsOf } from './carriers'
import { useCurrencyOptions } from './useCurrencyOptions'

// «Перевозка и страховка» поставки (очередь 4, задача 2): счета перевозчиков по этой поставке (фрахт идёт в
// себестоимость) и страховка груза — только сведения (страховщик, полис, сумма, стоимость, файл), без «застраховать».
// В карточке поставки клиента и в карточке заявки сотрудника. carrierHref — карточка перевозчика (у клиента и сотрудника своя).
const props = withDefaults(defineProps<{ caseId: string; clientId: string; carrierHref: (id: string) => string; compact?: boolean }>(), { compact: false })
const { t, locale } = useI18n()
const uid = useId()

const freight = shallowRef<CarrierInvoice[]>([])
const insurance = shallowRef<CargoInsurance | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
let seq = 0
const load = async () => {
  const my = ++seq
  if (!insurance.value) state.value = 'loading'
  try {
    const [f, ins] = await Promise.all([carriersApi.caseFreight(props.caseId), carriersApi.insurance(props.caseId)])
    if (my !== seq) return
    freight.value = f
    insurance.value = ins
    state.value = 'ready'
  } catch {
    if (my === seq) state.value = 'error'
  }
}
watch(() => props.caseId, () => { insurance.value = null; void load() }, { immediate: true })

const money = (n: number | null, cur: string | null) => (n == null ? '—' : `${formatNumberIn(locale.value, n, 2, 2)}${cur ? ` ${cur}` : ''}`)
const kzt = (n: number) => formatMoneyIn(locale.value, n)
const canEdit = computed(() => !!insurance.value?.canEdit)

// ---- Страховка ----
const currencies = useCurrencyOptions()
const editOpen = ref(false)
const form = ref<CargoInsuranceFields>(emptyInsurance())
const touched = ref(false)
const saving = ref(false)
const serverErrors = ref<Record<string, string>>({})
const openEdit = () => {
  form.value = insurance.value ? insuranceFieldsOf(insurance.value) : emptyInsurance()
  touched.value = false
  serverErrors.value = {}
  void currencies.load()
  editOpen.value = true
}
const errors = computed(() => (touched.value ? insuranceErrors(form.value) : {}))
const err = (f: keyof CargoInsuranceFields) => (errors.value[f] ? t(errors.value[f]!) : serverErrors.value[f])
const save = async () => {
  if (saving.value) return
  touched.value = true
  serverErrors.value = {}
  if (Object.keys(insuranceErrors(form.value)).length) return
  saving.value = true
  try {
    insurance.value = await carriersApi.saveInsurance(props.caseId, form.value)
    editOpen.value = false
    message.success(t('carriers.insurance.saved'))
  } catch (e) {
    serverErrors.value = serverFieldErrors(e)
    const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
    if (!Object.keys(serverErrors.value).length && res?.status === 400) message.error(res.data?.error || t('carriers.saveError'))
  } finally {
    saving.value = false
  }
}
const fileBusy = ref(false)
const upload = async (file: File | undefined) => {
  if (!file) return
  fileBusy.value = true
  try {
    insurance.value = await carriersApi.uploadInsuranceFile(props.caseId, file)
    message.success(t('carriers.insurance.fileSaved'))
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
    if (res?.status === 400) message.error(res.data?.error || t('carriers.saveError'))
  } finally { fileBusy.value = false }
}
const removeFile = async () => {
  fileBusy.value = true
  try {
    insurance.value = await carriersApi.deleteInsuranceFile(props.caseId)
  } catch { /* общий перехватчик */ } finally { fileBusy.value = false }
}
const downloadFile = async () => {
  const f = insurance.value?.file
  if (!f) return
  fileBusy.value = true
  try {
    saveBlob(await carriersApi.insuranceFile(props.caseId), f.fileName)
  } catch { /* общий перехватчик */ } finally { fileBusy.value = false }
}
const downloadInvoice = async (i: CarrierInvoice) => {
  if (!i.file) return
  try {
    saveBlob(await carriersApi.invoiceFile(props.clientId, i.carrierId, i.id), i.file.fileName)
  } catch { /* общий перехватчик */ }
}

const insuranceRows = computed(() => {
  const x = insurance.value
  if (!x) return []
  return [
    { key: 'insurer', label: t('carriers.insurance.insurer'), value: x.insurer || '—' },
    { key: 'policy', label: t('carriers.insurance.policy'), value: x.policyNumber || '—' },
    { key: 'insured', label: t('carriers.insurance.insuredAmount'), value: money(x.insuredAmount, x.insuredCurrency) },
    { key: 'premium', label: t('carriers.insurance.premium'), value: money(x.premiumAmount, x.premiumCurrency) },
  ]
})

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const titleId = `ship-transport-${uid}`
const iconBtn = 'inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink-3 outline-hidden hover:text-ink focus-visible:shadow-focus disabled:cursor-progress sm:min-h-8 sm:min-w-8'
defineExpose({ reload: load })
</script>

<template>
  <section :aria-labelledby="titleId" data-ship-transport>
    <h2 :id="titleId" :class="cn('m-0 mb-2 font-semibold text-ink', compact ? 'text-sm' : 'text-[15px] leading-6')">{{ t('carriers.block.title') }}</h2>

    <div v-if="state === 'loading'" class="flex flex-col gap-2" aria-busy="true"><ZSkeleton v-for="i in 3" :key="i" height="16px" /></div>
    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-x-3 gap-y-2" data-transport-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('carriers.block.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-transport-retry @click="load">{{ t('carriers.retry') }}</ZButton>
    </div>
    <template v-else>
      <!-- Фрахт -->
      <h3 class="m-0 text-[13px] font-semibold text-ink-2">{{ t('carriers.block.freight') }}</h3>
      <p v-if="!freight.length" class="m-0 mt-1 text-sm text-ink-3" data-freight-empty>{{ t('carriers.block.noFreight') }}</p>
      <ul v-else role="list" class="m-0 mt-1 flex list-none flex-col p-0">
        <li v-for="i in freight" :key="i.id" class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line py-2 last:border-b-0" :data-freight="i.id">
          <span class="min-w-0 flex-1 text-sm">
            <RouterLink :to="carrierHref(i.carrierId)" class="text-ink no-underline hover:text-zircon-ink hover:underline focus-visible:shadow-focus" data-freight-carrier>{{ i.carrierName }}</RouterLink>
            <span class="block text-xs text-ink-3">{{ t('carriers.invoice.numberFrom', { n: i.number, date: formatDay(i.invoiceDate) }) }}</span>
          </span>
          <ZTag :tone="i.isPaid ? 'done' : 'wait'" size="sm">{{ t(i.isPaid ? 'carriers.invoice.paidTag' : 'carriers.invoice.unpaidTag') }}</ZTag>
          <span class="flex flex-col text-right text-sm tabular-nums">
            <span class="text-ink-2">{{ money(i.amount, i.currency) }}</span>
            <span v-if="i.currency !== 'KZT'" class="text-xs text-muted">
              <template v-if="i.amountKzt != null">≈ {{ kzt(i.amountKzt) }}</template>
              <span v-else class="inline-flex items-center gap-1 text-gold-ink"><PhWarning :size="12" aria-hidden="true" />{{ t('carriers.invoice.noRate') }}</span>
            </span>
          </span>
          <button
            v-if="i.file"
            type="button"
            :class="iconBtn"
            :aria-label="t('carriers.invoice.download', { name: i.file.fileName })"
            data-freight-download
            @click="downloadInvoice(i)"
          ><PhDownloadSimple :size="15" aria-hidden="true" /></button>
        </li>
      </ul>
      <p class="m-0 mt-1 text-xs text-ink-3">{{ t('carriers.block.freightHint') }}</p>

      <!-- Страховка -->
      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 class="m-0 min-w-0 flex-1 text-[13px] font-semibold text-ink-2">{{ t('carriers.insurance.title') }}</h3>
        <ZButton v-if="canEdit" size="sm" class="max-sm:h-11 max-sm:w-full" data-insurance-edit @click="openEdit">
          <template #icon><PhPencilSimple :size="14" aria-hidden="true" /></template>
          {{ t(hasInsurance(insurance) ? 'carriers.insurance.edit' : 'carriers.insurance.add') }}
        </ZButton>
      </div>
      <p v-if="!hasInsurance(insurance)" class="m-0 mt-1 text-sm text-ink-3" data-insurance-empty>{{ t('carriers.insurance.empty') }}</p>
      <template v-else>
        <dl class="m-0 mt-1 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2" data-insurance>
          <div v-for="r in insuranceRows" :key="r.key" class="flex min-w-0 flex-col" :data-insurance-row="r.key">
            <dt class="text-xs text-muted">{{ r.label }}</dt>
            <dd class="m-0 text-sm break-words text-ink tabular-nums">{{ r.value }}</dd>
          </div>
        </dl>
      </template>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <template v-if="insurance?.file">
          <button
            type="button"
            class="inline-flex min-h-11 min-w-0 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent p-0 font-sans text-sm text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus sm:min-h-8"
            :disabled="fileBusy"
            data-insurance-download
            @click="downloadFile"
          ><PhDownloadSimple :size="15" aria-hidden="true" /><span class="break-all">{{ insurance.file.fileName }}</span></button>
          <button
            v-if="canEdit"
            type="button"
            :class="cn(iconBtn, 'hover:text-danger')"
            :disabled="fileBusy"
            :aria-label="t('carriers.insurance.deleteFile')"
            data-insurance-file-delete
            @click="removeFile"
          ><PhTrash :size="15" aria-hidden="true" /></button>
        </template>
        <ZUpload
          v-if="canEdit"
          :accept="ACCEPT"
          :max-size-mb="25"
          :loading="fileBusy"
          button-size="sm"
          class="max-sm:w-full"
          data-insurance-upload
          @select="upload($event[0])"
        >{{ t(insurance?.file ? 'carriers.insurance.replaceFile' : 'carriers.insurance.attachFile') }}</ZUpload>
      </div>
    </template>

    <ZModal
      v-model:open="editOpen"
      :title="t('carriers.insurance.editTitle')"
      :ok-text="t('carriers.form.save')"
      :cancel-text="t('carriers.form.cancel')"
      :confirm-loading="saving"
      :width="520"
      data-insurance-modal
      @ok="save"
    >
      <template #description>{{ t('carriers.insurance.editHint') }}</template>
      <form class="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2" novalidate @submit.prevent="save">
        <ZField :label="t('carriers.insurance.insurer')" :error="err('insurer')">
          <ZInput v-model:value="form.insurer" :maxlength="300" class="max-sm:h-11" data-insurance-insurer />
        </ZField>
        <ZField :label="t('carriers.insurance.policy')" :error="err('policyNumber')">
          <ZInput v-model:value="form.policyNumber" mono :maxlength="100" class="max-sm:h-11" data-insurance-policy />
        </ZField>
        <ZField :label="t('carriers.insurance.insuredAmount')" :error="err('insuredAmount') ?? err('insuredCurrency')" class="sm:col-span-2">
          <div class="flex w-full gap-2">
            <ZNumber v-model:value="form.insuredAmount" :min="0" :precision="2" class="min-w-0 flex-1 max-sm:h-11" data-insurance-insured />
            <ZSelect
              :value="form.insuredCurrency"
              :options="currencies.withValue(form.insuredCurrency)"
              show-search
              allow-clear
              :placeholder="t('carriers.form.currencyPh')"
              :popup-width="280"
              :aria-label="t('carriers.invoice.currency')"
              class="w-[120px] shrink-0 max-sm:h-11"
              data-insurance-insured-currency
              @update:value="form.insuredCurrency = ($event as string | null) ?? null"
            />
          </div>
        </ZField>
        <ZField :label="t('carriers.insurance.premium')" :error="err('premiumAmount') ?? err('premiumCurrency')" class="sm:col-span-2">
          <div class="flex w-full gap-2">
            <ZNumber v-model:value="form.premiumAmount" :min="0" :precision="2" class="min-w-0 flex-1 max-sm:h-11" data-insurance-premium />
            <ZSelect
              :value="form.premiumCurrency"
              :options="currencies.withValue(form.premiumCurrency)"
              show-search
              allow-clear
              :placeholder="t('carriers.form.currencyPh')"
              :popup-width="280"
              :aria-label="t('carriers.invoice.currency')"
              class="w-[120px] shrink-0 max-sm:h-11"
              data-insurance-premium-currency
              @update:value="form.premiumCurrency = ($event as string | null) ?? null"
            />
          </div>
        </ZField>
        <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
      </form>
    </ZModal>
  </section>
</template>
