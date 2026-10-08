<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZForm from '@/components/z/ZForm.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { import40ContractApi, type ClientCompanyProfileDto } from '@/api/import40Contract'
import { extractServerText } from '@/api/client'
import type { CompanyLookupDto } from '@/api/companyLookup'
import { useBinLookup } from '@/composables/useBinLookup'
import { parseKzAddress } from '@/utils/kzAddress'
import { filterCountryOption } from '@/utils/countries'
import type { ZOption, ZOptionValue } from '@/ui/options'
import type { ZRule } from '@/ui/validation'
import { message } from '@/ui/message'
import { phoneField, phoneSelect } from '@/views/client/wizard/wizardUi'

// Форма реквизитов компании клиента — все поля прежнего шага «Реквизиты» (Import40CompanyView), на ZForm.
// Обязательны наименование, БИН (12 цифр) и руководитель. «Найти» по БИН (ГБД ЮЛ / КГД) заполняет как
// прежний applyCompanyLookup. Сохранение — здесь же (ошибка сервера — на месте, без тоста), наверх — saved.
const props = defineProps<{
  clientId: string
  profile: ClientCompanyProfileDto | null
  countryOptions: ZOption[]
  /** Можно закрыть без сохранения (реквизиты уже заполнены — под формой есть сводка). */
  cancellable?: boolean
}>()
const emit = defineEmits<{ saved: [profile: ClientCompanyProfileDto]; cancel: [] }>()
const { t } = useI18n()

const p = props.profile
const form = reactive({
  companyName: p?.companyName ?? '',
  bin: p?.bin ?? '',
  directorName: p?.directorName ?? '',
  directorBasis: p?.directorBasis || 'устава',
  legalAddress: p?.legalAddress ?? '',
  bank: p?.bank ?? '',
  iik: p?.iik ?? '',
  bik: p?.bik ?? '',
  phone: p?.phone ?? '',
  email: p?.email ?? '',
  legalCountryCode: (p?.legalCountryCode ?? '398') as string | null,
  legalRegion: (p?.legalRegion ?? '') as string | null,
  legalCity: (p?.legalCity ?? '') as string | null,
  legalStreet: (p?.legalStreet ?? '') as string | null,
  kbe: (p?.kbe ?? '') as string | null,
  okpo: (p?.okpo ?? '') as string | null,
  ownershipType: (p?.ownershipType ?? '') as string | null,
  contactPersonName: (p?.contactPersonName ?? '') as string | null,
  contactPersonPosition: (p?.contactPersonPosition ?? '') as string | null,
  contactPhone: (p?.contactPhone ?? '') as string | null,
  contactEmail: (p?.contactEmail ?? '') as string | null,
})

const rules = computed<Record<string, ZRule[]>>(() => ({
  companyName: [{ required: true, whitespace: true, message: () => t('client.company.form.required') }],
  bin: [
    { required: true, whitespace: true, message: () => t('client.company.form.required') },
    { pattern: /^\s*\d{12}\s*$/, message: () => t('client.company.form.binInvalid') },
  ],
  directorName: [{ required: true, whitespace: true, message: () => t('client.company.form.required') }],
}))

// Страна в ZSelect — null, а не '' (пустая строка — выбранное значение без подписи).
const country = computed<ZOptionValue | null>({
  get: () => form.legalCountryCode || null,
  set: (v) => { form.legalCountryCode = v === null || v === undefined ? null : String(v) },
})
// Код из профиля, которого нет в справочнике (или справочник не загрузился), — показываем кодом, а не пустотой.
const countries = computed<ZOption[]>(() => {
  const code = form.legalCountryCode
  if (!code || props.countryOptions.some((o) => o.value === code)) return props.countryOptions
  return [{ value: code, label: code, searchText: code }, ...props.countryOptions]
})
const filterCountry = (input: string, o: ZOption) => filterCountryOption(input, o as { searchText?: string })

// «Найти» (ГБД ЮЛ, data.egov.kz): наименование/руководитель/юр. адрес — перезаписываем (пользователь явно
// запросил), части адреса — только пустые (разбор эвристический, см. parseKzAddress). Как прежний экран.
const { loading: binLoading, lookup } = useBinLookup()
const binReady = computed(() => /^\d{12}$/.test(form.bin.trim()))
const applyCompanyLookup = (c: CompanyLookupDto) => {
  if (c.nameRu || c.nameKz) form.companyName = c.nameRu ?? c.nameKz ?? form.companyName
  if (c.director) form.directorName = c.director
  const address = c.addressRu ?? c.addressKz
  if (address) {
    form.legalAddress = address
    const parsed = parseKzAddress(address)
    if (!form.legalRegion && parsed.region) form.legalRegion = parsed.region
    if (!form.legalCity && parsed.city) form.legalCity = parsed.city
    // Отдельных полей «Район»/«Дом»/«Помещение» в профиле нет — они остаются в строке улицы.
    const streetLine = [parsed.district, parsed.street, parsed.house ? `д. ${parsed.house}` : null, parsed.apt ? `пом. ${parsed.apt}` : null]
      .filter(Boolean).join(', ')
    if (!form.legalStreet && streetLine) form.legalStreet = streetLine
  }
  form.legalCountryCode = form.legalCountryCode || '398'
}
const findByBin = async () => {
  if (!binReady.value) return
  const company = await lookup(form.bin.trim())
  if (company) applyCompanyLookup(company)
}

const saving = ref(false)
const saveError = ref('')
const save = async () => {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const saved = await import40ContractApi.saveProfile(props.clientId, { ...form, bin: form.bin.trim() }, { silent: true })
    message.success(t('client.company.form.saved'))
    emit('saved', saved)
  } catch (e: unknown) {
    saveError.value = extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? t('client.company.form.saveError')
  } finally {
    saving.value = false
  }
}

const group = 'm-0 text-[13px] leading-5 font-semibold text-ink-2'
const groupGap = 'mt-3 border-0 border-t border-solid border-line pt-5'
</script>

<template>
  <ZForm :model="form" :rules="rules" layout="grid" :aria-label="t('client.company.form.label')" data-requisites-form @finish="save">
    <h3 :class="group">{{ t('client.company.form.groupCompany') }}</h3>
    <ZField :label="t('client.company.form.companyName')" name="companyName" :span="12">
      <ZInput v-model:value="form.companyName" :placeholder="t('client.company.form.companyNamePh')" :class="phoneField" data-f="companyName" />
    </ZField>
    <ZField :label="t('client.company.form.bin')" name="bin" :span="6">
      <div class="flex gap-2">
        <ZInput
          v-model:value="form.bin"
          mono
          inputmode="numeric"
          autocomplete="off"
          :maxlength="12"
          :placeholder="t('client.company.form.binPh')"
          :class="[phoneField, 'flex-1']"
          data-f="bin"
          @press-enter="(e: KeyboardEvent) => { if (binReady) { e.preventDefault(); void findByBin() } }"
        />
        <ZButton
          :loading="binLoading"
          :disabled="!binReady"
          :aria-label="t('client.company.form.findLabel')"
          class="shrink-0 max-sm:h-12 max-sm:px-4 max-sm:text-base"
          data-bin-find
          @click="findByBin"
        >
          <PhMagnifyingGlass :size="16" aria-hidden="true" />{{ t('client.company.form.find') }}
        </ZButton>
      </div>
    </ZField>
    <ZField :label="t('client.company.form.director')" name="directorName" :span="6">
      <ZInput v-model:value="form.directorName" :placeholder="t('client.company.form.directorPh')" :class="phoneField" data-f="directorName" />
    </ZField>
    <ZField :label="t('client.company.form.basis')" :span="6" :help="t('client.company.form.basisHelp')">
      <ZInput v-model:value="form.directorBasis" :class="phoneField" data-f="directorBasis" />
    </ZField>
    <ZField :label="t('client.company.form.ownership')" :span="6">
      <ZInput v-model:value="form.ownershipType" :class="phoneField" data-f="ownershipType" />
    </ZField>
    <ZField :label="t('client.company.form.legalAddress')" :span="12">
      <ZInput v-model:value="form.legalAddress" :class="phoneField" data-f="legalAddress" />
    </ZField>

    <h3 :class="[group, groupGap]">{{ t('client.company.form.groupAddress') }}</h3>
    <ZField :label="t('client.company.form.country')" :span="4">
      <ZSelect
        v-model:value="country"
        :options="countries"
        show-search
        allow-clear
        :filter-option="filterCountry"
        :placeholder="t('client.company.form.countryPh')"
        :class="phoneSelect"
        data-f="legalCountryCode"
      />
    </ZField>
    <ZField :label="t('client.company.form.region')" :span="4">
      <ZInput v-model:value="form.legalRegion" :class="phoneField" data-f="legalRegion" />
    </ZField>
    <ZField :label="t('client.company.form.city')" :span="4">
      <ZInput v-model:value="form.legalCity" :class="phoneField" data-f="legalCity" />
    </ZField>
    <ZField :label="t('client.company.form.street')" :span="12">
      <ZInput v-model:value="form.legalStreet" :class="phoneField" data-f="legalStreet" />
    </ZField>

    <h3 :class="[group, groupGap]">{{ t('client.company.form.groupBank') }}</h3>
    <ZField :label="t('client.company.form.bank')" :span="12">
      <ZInput v-model:value="form.bank" :class="phoneField" data-f="bank" />
    </ZField>
    <ZField :label="t('client.company.form.iik')" :span="6">
      <ZInput v-model:value="form.iik" mono autocomplete="off" :class="phoneField" data-f="iik" />
    </ZField>
    <ZField :label="t('client.company.form.bik')" :span="6">
      <ZInput v-model:value="form.bik" mono autocomplete="off" :class="phoneField" data-f="bik" />
    </ZField>
    <ZField :label="t('client.company.form.kbe')" :span="6">
      <ZInput v-model:value="form.kbe" mono autocomplete="off" :class="phoneField" data-f="kbe" />
    </ZField>
    <ZField :label="t('client.company.form.okpo')" :span="6">
      <ZInput v-model:value="form.okpo" mono autocomplete="off" :class="phoneField" data-f="okpo" />
    </ZField>

    <h3 :class="[group, groupGap]">{{ t('client.company.form.groupContacts') }}</h3>
    <ZField :label="t('client.company.form.phone')" :span="6">
      <ZPhone v-model:value="form.phone" :class="phoneField" data-f="phone" />
    </ZField>
    <ZField :label="t('client.company.form.email')" :span="6">
      <ZInput v-model:value="form.email" type="email" autocomplete="email" :class="phoneField" data-f="email" />
    </ZField>
    <ZField :label="t('client.company.form.contactName')" :span="6">
      <ZInput v-model:value="form.contactPersonName" :class="phoneField" data-f="contactPersonName" />
    </ZField>
    <ZField :label="t('client.company.form.contactPosition')" :span="6">
      <ZInput v-model:value="form.contactPersonPosition" :class="phoneField" data-f="contactPersonPosition" />
    </ZField>
    <ZField :label="t('client.company.form.contactPhone')" :span="6">
      <ZPhone v-model:value="form.contactPhone" :class="phoneField" data-f="contactPhone" />
    </ZField>
    <ZField :label="t('client.company.form.contactEmail')" :span="6">
      <ZInput v-model:value="form.contactEmail" type="email" autocomplete="off" :class="phoneField" data-f="contactEmail" />
    </ZField>

    <ZAlert v-if="saveError" type="error" show-icon :message="saveError" class="mt-1" data-requisites-error />

    <div class="mt-2 flex flex-wrap items-center gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
      <ZButton variant="primary" html-type="submit" :loading="saving" class="h-10 px-5 max-sm:h-12 max-sm:text-base" data-requisites-save>
        {{ t('client.company.form.save') }}
      </ZButton>
      <ZButton v-if="cancellable" variant="ghost" class="h-10 px-4 max-sm:h-12 max-sm:text-base" data-requisites-cancel @click="emit('cancel')">
        {{ t('common.cancel') }}
      </ZButton>
    </div>
  </ZForm>
</template>
