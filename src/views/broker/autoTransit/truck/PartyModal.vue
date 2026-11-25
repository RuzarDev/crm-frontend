<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import type { Party, PartyFields, PartyInvoice } from '@/api/autoTransit'
import { clientsOnboardingApi, type ClientOnboardingRow } from '@/api/clientsOnboarding'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { useAuthStore } from '@/stores/auth'
import type { ZOption } from '@/ui/options'
import type { ActionResult } from './useTruck'
import { CURRENCY_OPTIONS, diffPatch, upperCode } from './truckView'

// Партия: создать или изменить. Получатель — клиент платформы (подставляет название, БИН, страну KZ, почту, телефон;
// список «Клиентов» — по праву clients.read) или вручную. Страны — две буквы, валюта — три, заглавными.
// В правке уходят только изменённые поля, очищенное — null. Очередь 3: номер ПИ, краткий номер от СВХ (без него
// «ТД подана» не отметить) и доп. инвойсы — список уходит целиком, только если изменился.
const props = defineProps<{
  open: boolean
  party: Party | null
  save: (fields: PartyFields) => Promise<ActionResult>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const auth = useAuthStore()
const F = 'broker.autoTransit.party.fields'
const countries = useCountryAlpha2Options()

type Draft = {
  clientId: string | null
  recipientName: string; recipientRegNumber: string; recipientCountry: string; recipientEmail: string; recipientPhone: string
  shipperName: string; shipperCountry: string; invoiceNumber: string; invoiceDate: string | null
  places: number | null; grossKg: number | null; value: number | null; currency: string
  destinationCountry: string; destinationOfficeCode: string
  piNumber: string; shortNumber: string
}
const fromParty = (p: Party | null): Draft => ({
  clientId: p?.clientId ?? null,
  recipientName: p?.recipientName ?? '', recipientRegNumber: p?.recipientRegNumber ?? '', recipientCountry: p?.recipientCountry ?? '',
  recipientEmail: p?.recipientEmail ?? '', recipientPhone: p?.recipientPhone ?? '',
  shipperName: p?.shipperName ?? '', shipperCountry: p?.shipperCountry ?? '',
  invoiceNumber: p?.invoiceNumber ?? '', invoiceDate: p?.invoiceDate ?? null,
  places: p ? p.places || null : null, grossKg: p ? p.grossKg || null : null, value: p ? p.value || null : null, currency: p?.currency ?? '',
  destinationCountry: p?.destinationCountry ?? '', destinationOfficeCode: p?.destinationOfficeCode ?? '',
  piNumber: p?.piNumber ?? '', shortNumber: p?.shortNumber ?? '',
})
const invoicesOf = (p: Party | null): PartyInvoice[] => (p?.additionalInvoices ?? []).map((x) => ({ number: x.number ?? '', date: x.date ?? null }))
const invoices = ref<PartyInvoice[]>([])
let initialInvoices: PartyInvoice[] = []
const normInvoices = (list: PartyInvoice[]) => list.map((x) => ({ number: x.number.trim(), date: x.date || null }))
/** Как на сервере: не больше 100 доп. инвойсов (ревью этапа 1, M1). */
const MAX_INVOICES = 100
const addInvoice = () => { if (invoices.value.length < MAX_INVOICES) invoices.value.push({ number: '', date: null }) }
/** Ошибка номера строки: ключ сервера additionalInvoices.{i}.number (или старый additionalInvoices.{i}). */
const invoiceNumberError = (i: number) => errors.value[`additionalInvoices.${i}.number`] ?? errors.value[`additionalInvoices.${i}`]
const removeInvoice = (i: number) => { invoices.value.splice(i, 1) }
const draft = reactive<Draft>(fromParty(null))
let initial: Draft = fromParty(null)
const errors = ref<Record<string, string>>({})
const saving = ref(false)

// ---- Клиенты платформы ----
const canClients = computed(() => auth.hasPermission('clients.read'))
const clients = ref<ClientOnboardingRow[]>([])
let clientsStarted = false
const loadClients = async () => {
  if (clientsStarted || !canClients.value) return
  clientsStarted = true
  try {
    clients.value = await clientsOnboardingApi.list({ silent: true })
  } catch {
    clientsStarted = false // без списка — ввод вручную; повторим при следующем открытии
  }
}
const clientName = (c: ClientOnboardingRow) => c.companyName?.trim() || c.username
const clientOptions = computed<ZOption[]>(() => clients.value.map((c) => ({
  value: c.id,
  label: c.bin ? `${clientName(c)} · ${c.bin}` : clientName(c),
})))
const onClient = (v: unknown) => {
  const id = v == null ? null : String(v)
  draft.clientId = id
  const c = id ? clients.value.find((x) => x.id === id) : undefined
  if (!c) return
  draft.recipientName = clientName(c)
  if (c.bin) draft.recipientRegNumber = c.bin
  if (!draft.recipientCountry) draft.recipientCountry = 'KZ'
  if (c.email && !draft.recipientEmail) draft.recipientEmail = c.email
  if (c.phone && !draft.recipientPhone) draft.recipientPhone = c.phone
}

watch(() => props.open, (v) => {
  if (!v) return
  initial = fromParty(props.party)
  Object.assign(draft, initial)
  initialInvoices = invoicesOf(props.party)
  invoices.value = invoicesOf(props.party)
  errors.value = {}
  void loadClients()
})

type CodeKey = 'recipientCountry' | 'shipperCountry' | 'destinationCountry'
const setCountry = (k: CodeKey, v: string) => { draft[k] = upperCode(v, 2) }
const setCurrency = (v: string) => { draft.currency = upperCode(v, 3) }

const localErrors = (): Record<string, string> => {
  const e: Record<string, string> = {}
  for (const k of ['recipientCountry', 'shipperCountry', 'destinationCountry'] as const) {
    if (draft[k] && !/^[A-Z]{2}$/.test(draft[k])) e[k] = t('broker.autoTransit.truck.countryHint')
  }
  if (draft.currency && !/^[A-Z]{3}$/.test(draft.currency)) e.currency = t(`${F}.currencyHint`)
  invoices.value.forEach((x, i) => { if (!x.number.trim()) e[`additionalInvoices.${i}.number`] = t(`${F}.invoiceRequired`) })
  return e
}

const onOk = async () => {
  const local = localErrors()
  if (Object.keys(local).length) { errors.value = local; return }
  const fields = (props.party ? diffPatch(initial, draft) : diffPatch(fromParty(null), draft)) as PartyFields
  const nextInvoices = normInvoices(invoices.value)
  if (JSON.stringify(nextInvoices) !== JSON.stringify(normInvoices(props.party ? initialInvoices : []))) fields.additionalInvoices = nextInvoices
  if (props.party && !Object.keys(fields).length) { emit('update:open', false); return }
  saving.value = true
  try {
    const res = await props.save(fields)
    if (res.ok) emit('update:open', false)
    else errors.value = res.fieldErrors
  } finally {
    saving.value = false
  }
}
const title = computed(() => (props.party ? t('broker.autoTransit.party.modal.editTitle', { n: props.party.number }) : t('broker.autoTransit.party.modal.createTitle')))
const section = 'col-span-full m-0 mt-2 text-xs font-semibold tracking-[0.02em] text-muted uppercase first:mt-0'
</script>

<template>
  <ZModal
    :open="open"
    :title="title"
    :ok-text="t('broker.autoTransit.truck.save')"
    :confirm-loading="saving"
    :width="720"
    data-party-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <h3 :class="section">{{ t(`${F}.sectionRecipient`) }}</h3>
      <ZField v-if="canClients" class="sm:col-span-2" :label="t(`${F}.client`)" :error="errors.clientId" :extra="t(`${F}.clientHint`)">
        <ZSelect
          :value="draft.clientId"
          :options="clientOptions"
          show-search
          allow-clear
          :placeholder="t(`${F}.clientPlaceholder`)"
          data-party-client
          @update:value="onClient"
        />
      </ZField>
      <ZField class="sm:col-span-2" :label="t(`${F}.recipientName`)" :error="errors.recipientName">
        <ZInput v-model:value="draft.recipientName" :maxlength="300" data-party-recipient />
      </ZField>
      <ZField :label="t(`${F}.recipientRegNumber`)" :error="errors.recipientRegNumber">
        <ZInput v-model:value="draft.recipientRegNumber" mono :maxlength="50" data-party-reg />
      </ZField>
      <ZField :label="t(`${F}.recipientCountry`)" :error="errors.recipientCountry">
        <ZCombobox :value="draft.recipientCountry" :options="countries" mono allow-clear data-party-country @update:value="setCountry('recipientCountry', $event)" />
      </ZField>
      <ZField :label="t(`${F}.recipientEmail`)" :error="errors.recipientEmail">
        <ZInput v-model:value="draft.recipientEmail" type="email" :maxlength="200" data-party-email />
      </ZField>
      <ZField :label="t(`${F}.recipientPhone`)" :error="errors.recipientPhone">
        <ZInput v-model:value="draft.recipientPhone" type="tel" :maxlength="50" />
      </ZField>

      <h3 :class="section">{{ t(`${F}.sectionShipper`) }}</h3>
      <ZField :label="t(`${F}.shipperName`)" :error="errors.shipperName">
        <ZInput v-model:value="draft.shipperName" :maxlength="300" />
      </ZField>
      <ZField :label="t(`${F}.shipperCountry`)" :error="errors.shipperCountry">
        <ZCombobox :value="draft.shipperCountry" :options="countries" mono allow-clear @update:value="setCountry('shipperCountry', $event)" />
      </ZField>

      <h3 :class="section">{{ t(`${F}.sectionInvoice`) }}</h3>
      <ZField :label="t(`${F}.invoiceNumber`)" :error="errors.invoiceNumber">
        <ZInput v-model:value="draft.invoiceNumber" mono :maxlength="100" data-party-invoice-number />
      </ZField>
      <ZField :label="t(`${F}.invoiceDate`)" :error="errors.invoiceDate">
        <ZDate v-model:value="draft.invoiceDate" allow-clear />
      </ZField>
      <ZField :label="t(`${F}.places`)" :error="errors.places">
        <ZNumber v-model:value="draft.places" :min="0" :precision="0" data-party-places-input />
      </ZField>
      <ZField :label="t(`${F}.grossKg`)" :error="errors.grossKg">
        <ZNumber v-model:value="draft.grossKg" :min="0" :precision="3" />
      </ZField>
      <ZField :label="t(`${F}.value`)" :error="errors.value">
        <ZNumber v-model:value="draft.value" :min="0" :precision="2" />
      </ZField>
      <ZField :label="t(`${F}.currency`)" :error="errors.currency">
        <ZCombobox :value="draft.currency" :options="CURRENCY_OPTIONS" mono allow-clear data-party-currency @update:value="setCurrency" />
      </ZField>

      <div class="flex min-w-0 flex-col gap-2 sm:col-span-2" data-party-extra-invoices>
        <span class="text-[13px] font-medium text-ink-2">{{ t(`${F}.additionalInvoices`) }}</span>
        <span class="text-xs text-muted">{{ t(`${F}.additionalInvoicesHint`) }}</span>
        <p v-if="errors.additionalInvoices" class="m-0 text-xs text-tone-danger-fg" role="alert" data-party-invoices-error>{{ errors.additionalInvoices }}</p>
        <div v-for="(inv, i) in invoices" :key="i" class="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto] items-start gap-2 max-sm:grid-cols-[minmax(0,1fr)_auto]">
          <ZField :label="t(`${F}.invoiceNumber`)" :error="invoiceNumberError(i)">
            <ZInput v-model:value="inv.number" mono :maxlength="100" :data-party-extra-invoice="i" />
          </ZField>
          <ZField :label="t(`${F}.invoiceDate`)" :error="errors[`additionalInvoices.${i}.date`]" class="max-sm:order-3 max-sm:col-span-2">
            <ZDate v-model:value="inv.date" allow-clear />
          </ZField>
          <button
            type="button"
            class="mt-6 inline-flex size-9 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11"
            :aria-label="t(`${F}.removeInvoice`, { n: i + 1 })"
            data-party-remove-invoice
            @click="removeInvoice(i)"
          ><PhX :size="16" aria-hidden="true" /></button>
        </div>
        <ZButton size="sm" variant="ghost" class="self-start max-sm:h-11" :disabled="invoices.length >= MAX_INVOICES" data-party-add-invoice @click="addInvoice">
          <PhPlus :size="14" aria-hidden="true" />{{ t(`${F}.addInvoice`) }}
        </ZButton>
        <span v-if="invoices.length >= MAX_INVOICES" class="text-xs text-muted" data-party-invoices-limit>{{ t(`${F}.invoicesLimit`, { n: MAX_INVOICES }) }}</span>
      </div>

      <h3 :class="section">{{ t(`${F}.sectionPi`) }}</h3>
      <ZField :label="t(`${F}.piNumber`)" :error="errors.piNumber">
        <ZInput v-model:value="draft.piNumber" mono :maxlength="64" data-party-pi-number />
      </ZField>
      <ZField :label="t(`${F}.shortNumber`)" :error="errors.shortNumber" :extra="t(`${F}.shortNumberHint`)">
        <ZInput v-model:value="draft.shortNumber" mono :maxlength="32" data-party-short-number />
      </ZField>

      <h3 :class="section">{{ t(`${F}.sectionDestination`) }}</h3>
      <ZField :label="t(`${F}.destinationCountry`)" :error="errors.destinationCountry">
        <ZCombobox :value="draft.destinationCountry" :options="countries" mono allow-clear @update:value="setCountry('destinationCountry', $event)" />
      </ZField>
      <ZField :label="t(`${F}.destinationOfficeCode`)" :error="errors.destinationOfficeCode">
        <ZInput v-model:value="draft.destinationOfficeCode" mono :maxlength="20" />
      </ZField>
    </div>
  </ZModal>
</template>
