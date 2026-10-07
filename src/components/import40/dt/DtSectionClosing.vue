<template>
  <div class="dt-section">
    <div class="dt-section-bar"><DtGraphLabel graph="48" :text="t('dt.otsrochkaPlatezhey')" /></div>
    <div class="dt-grid-4">
      <a-form-item :label="t('dt.vidDokumenta')">
        <a-input v-uppercase v-model:value="form.deferralDocType" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.nomer')">
        <a-input v-uppercase v-model:value="form.deferralNumber" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.data')">
        <a-date-picker v-model:value="form.deferralDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.srok')">
        <a-date-picker v-model:value="form.deferralDueDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <a-form-item>
      <template #label><DtGraphLabel graph="52" :text="t('dt.garantiyaNedeystvitelnaDlya')" /></template>
      <a-input v-uppercase v-model:value="form.guaranteeInvalidFor" :disabled="readonly" @change="emitChange" />
    </a-form-item>

    <div class="dt-section-bar party-bar">
      <DtGraphLabel graph="54" :text="t('dt.mestoDataPodpisant')" />
      <a-button v-if="!readonly" type="link" size="small" :loading="profileLoading" @click="fillFromDeclarantProfile"> {{ t('dt.podstavitIzProfilya') }} </a-button>
    </div>
    <div class="dt-grid-3">
      <a-form-item :label="t('dt.fio')">
        <a-input v-uppercase v-model:value="form.signatoryFullName" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.dolzhnost')">
        <a-input v-uppercase v-model:value="form.signatoryPosition" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.vidDokumenta')">
        <a-select
          v-model:value="form.signatoryDocTypeCode" :options="classifiers.options('id-doc-types')"
          show-search allow-clear :get-popup-container="popupContainer" :disabled="readonly"
          :placeholder="t('dt.21UdostoverenieLichnosti')" style="width: 100%" @change="emitChange"
        />
      </a-form-item>
      <a-form-item :label="t('dt.dokumenta')">
        <a-input v-uppercase v-model:value="form.signatoryDocNumber" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.dataVydachi')">
        <a-date-picker v-model:value="form.signatoryDocIssueDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.kemVydan')">
        <a-input v-uppercase v-model:value="form.signatoryDocIssuedBy" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.strana')">
        <a-input v-uppercase v-model:value="form.signatoryDocCountryCode" :maxlength="2" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.doverennost')">
        <a-input v-uppercase v-model:value="form.powerOfAttorney" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.dataDoverennosti')">
        <a-date-picker v-model:value="form.powerOfAttorneyDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.srokDeystviyaDoverennosti')">
        <a-date-picker v-model:value="form.powerOfAttorneyValidUntil" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.brokerskogoDogovora')">
        <a-input v-uppercase v-model:value="form.brokerContractNumber" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.dokumentTekst')">
        <a-input v-uppercase v-model:value="form.signatoryDocument" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.telefon')">
        <PhoneInput v-model:value="form.signatoryPhone" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.dataPodpisaniya')">
        <a-date-picker v-model:value="form.signedDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="54" :text="t('dt.spravochnikFirmBrokerov')" /></div>
    <div class="dt-grid-3">
      <a-form-item :label="t('dt.firmaBrokerIzSpravochnika')">
        <a-select
          :value="brokerFirm.bin || undefined" :options="brokerFirmOptions" :disabled="readonly"
          show-search allow-clear option-filter-prop="label" :dropdown-match-select-width="false"
          :loading="brokerListLoading" :placeholder="t('dt.vyberiteFirmuBrokera')"
          :get-popup-container="popupContainer" style="width: 100%"
          @change="(v: unknown) => pickBrokerFirm((v as string) ?? null)"
        />
      </a-form-item>
      <a-form-item :label="t('dt.binFirmyBrokera')">
        <a-input-group compact style="display: flex">
          <a-input v-model:value="brokerFirm.bin" :disabled="readonly" :placeholder="t('dt.bin')" style="flex: 1" />
          <a-button v-if="!readonly" :loading="brokerFinding" @click="findBrokerFirm">{{ t('dt.nayti') }}</a-button>
        </a-input-group>
      </a-form-item>
      <a-form-item :label="t('dt.naimenovanieFirmy')">
        <a-input v-model:value="brokerFirm.name" :disabled="readonly" />
      </a-form-item>
      <a-form-item :label="t('dt.adres')">
        <a-input v-model:value="brokerFirm.address" :disabled="readonly" />
      </a-form-item>
      <a-form-item :label="t('dt.dataDogovora')">
        <a-date-picker v-model:value="brokerFirm.contractDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" />
      </a-form-item>
      <a-form-item :label="t('dt.srokDeystviya')">
        <a-date-picker v-model:value="brokerFirm.contractValidUntil" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" />
      </a-form-item>
      <a-form-item label=" ">
        <a-button v-if="!readonly" :loading="brokerSaving" @click="saveBrokerFirm">{{ t('dt.sohranitVSpravochnik') }}</a-button>
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from '@/ui/message'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { getBrokerFirmByBin, listBrokerFirms, upsertBrokerFirm } from '@/api/brokerFirms'
import type { BrokerFirmDto } from '@/api/brokerFirms'
import { declarantProfileApi } from '@/api/declarantProfile'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'
import PhoneInput from '@/components/ui/PhoneInput.vue'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()

const popupContainer = () => document.body

// Все поля секции — плоские скаляры (гр.48/52/54, без вложенных массивов),
// поэтому используем тот же простой reactive-спред, что и DtSectionFinance.vue,
// а не буфер с ручным deep-copy как в Parties/Transport.
const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })

// №8/9: подставить гр.54 из профиля декларанта (ФИО/доверенность/удостоверение).
const profileLoading = ref(false)
const fillFromDeclarantProfile = async () => {
  profileLoading.value = true
  try {
    const p = await declarantProfileApi.get()
    // Текстовые поля ДТ — UPPERCASE (как при ручном вводе через v-uppercase);
    // номера/даты/коды переносим как есть.
    const up = (v: string) => v.toUpperCase()
    if (p.fullName) form.signatoryFullName = up(p.fullName)
    if (p.position) form.signatoryPosition = up(p.position)
    if (p.phone) form.signatoryPhone = p.phone
    if (p.powerOfAttorneyNumber) form.powerOfAttorney = up(p.powerOfAttorneyNumber)
    if (p.powerOfAttorneyDate) form.powerOfAttorneyDate = p.powerOfAttorneyDate
    if (p.powerOfAttorneyValidUntil) form.powerOfAttorneyValidUntil = p.powerOfAttorneyValidUntil
    if (p.idDocTypeCode) form.signatoryDocTypeCode = p.idDocTypeCode
    if (p.idDocNumber) form.signatoryDocNumber = up(p.idDocNumber)
    if (p.idDocIssueDate) form.signatoryDocIssueDate = p.idDocIssueDate
    if (p.idDocIssuedBy) form.signatoryDocIssuedBy = up(p.idDocIssuedBy)
    if (p.idDocCountryCode) form.signatoryDocCountryCode = up(p.idDocCountryCode)
    emitChange()
    if (p.fullName || p.powerOfAttorneyNumber || p.idDocNumber) {
      message.success(t('dt.gr54ZapolnenaIzProfilya'))
    } else {
      message.info(t('dt.profilDeklarantaPustZapolnite'))
    }
  } catch {
    message.error(t('dt.neUdalosZagruzitProfil'))
  } finally {
    profileLoading.value = false
  }
}

// Блок-справочник фирм-брокеров. Это транзитное локальное состояние —
// в модели ДТ фирма-брокер отдельной колонкой не хранится, персистится только
// form.brokerContractNumber. Поля ниже используются лишь для поиска/сохранения
// записи в общий справочник фирм-брокеров (GET/POST /broker-firms).
const brokerFirm = reactive({
  bin: '',
  name: '',
  address: '' as string | null,
  contractDate: null as string | null,
  contractValidUntil: null as string | null,
})
const brokerFinding = ref(false)
const brokerSaving = ref(false)

// Справочник целиком: раньше блок был чисто локальным (пустые поля при каждом
// открытии ДТ) и сохранённую фирму приходилось доставать вводом БИН вручную —
// декларант считал, что справочник «не сохраняется». Теперь список грузится
// сразу, фирма выбирается из выпадающего списка и подставляется автоматически.
const brokerFirms = ref<BrokerFirmDto[]>([])
const brokerListLoading = ref(false)
const brokerPrefilled = ref(false)

const brokerFirmOptions = computed(() =>
  brokerFirms.value.map((f) => ({ value: f.bin, label: `${f.name} · ${f.bin}` })))

// applyContract: проставлять ли № брокерского договора в саму ДТ (гр.54).
const fillBrokerFirm = (f: BrokerFirmDto, applyContract: boolean) => {
  brokerFirm.bin = f.bin
  brokerFirm.name = f.name
  brokerFirm.address = f.address
  brokerFirm.contractDate = f.contractDate
  brokerFirm.contractValidUntil = f.contractValidUntil
  if (applyContract && !form.brokerContractNumber && f.contractNumber) {
    form.brokerContractNumber = f.contractNumber
    emitChange()
  }
}

const pickBrokerFirm = (bin: string | null) => {
  brokerPrefilled.value = true
  if (!bin) {
    brokerFirm.bin = ''
    return
  }
  const firm = brokerFirms.value.find((f) => f.bin === bin)
  if (firm) fillBrokerFirm(firm, true)
}

// Автоподстановка при открытии: фирма по уже указанному в ДТ номеру договора,
// иначе — единственная фирма справочника (типовой случай: свой брокер один).
const tryPrefillBrokerFirm = () => {
  if (brokerPrefilled.value || brokerFirm.bin || !brokerFirms.value.length) return
  const contract = (form.brokerContractNumber ?? '').trim()
  const byContract = contract
    ? brokerFirms.value.find((f) => (f.contractNumber ?? '').trim() === contract)
    : undefined
  const firm = byContract ?? (brokerFirms.value.length === 1 ? brokerFirms.value[0] : undefined)
  if (!firm) return
  fillBrokerFirm(firm, !byContract)
  brokerPrefilled.value = true
}

onMounted(async () => {
  brokerListLoading.value = true
  try {
    brokerFirms.value = await listBrokerFirms()
    tryPrefillBrokerFirm()
  } catch {
    /* справочник не загрузился — остаётся ручной ввод БИН с кнопкой «Найти» */
  } finally {
    brokerListLoading.value = false
  }
})

// ДТ приезжает асинхронно уже после монтирования секции — пробуем ещё раз,
// когда стал известен номер брокерского договора.
watch(() => props.modelValue.brokerContractNumber, () => tryPrefillBrokerFirm())

const findBrokerFirm = async () => {
  const bin = (brokerFirm.bin || '').trim()
  if (!bin) {
    message.warning(t('dt.ukazhiteBinFirmyBrokera'))
    return
  }
  brokerFinding.value = true
  try {
    const firm = await getBrokerFirmByBin(bin)
    if (!firm) {
      message.info(t('dt.firmaBrokerSTakim'))
      return
    }
    brokerFirm.name = firm.name
    brokerFirm.address = firm.address
    brokerFirm.contractDate = firm.contractDate
    brokerFirm.contractValidUntil = firm.contractValidUntil
    // № договора персистится в ДТ (гр.54) — автозаполняем и уведомляем родителя.
    form.brokerContractNumber = firm.contractNumber
    emitChange()
    message.success(t('dt.firmaBrokerNaydenaDogovora'))
  } catch {
    message.error(t('dt.neUdalosVypolnitPoisk'))
  } finally {
    brokerFinding.value = false
  }
}

const saveBrokerFirm = async () => {
  const name = (brokerFirm.name || '').trim()
  const bin = (brokerFirm.bin || '').trim()
  if (!name || !bin) {
    message.warning(t('dt.dlyaSohraneniyaNuzhnyNaimenovanie'))
    return
  }
  brokerSaving.value = true
  try {
    await upsertBrokerFirm({
      name,
      bin,
      address: brokerFirm.address || null,
      contractNumber: form.brokerContractNumber || null,
      contractDate: brokerFirm.contractDate || null,
      contractValidUntil: brokerFirm.contractValidUntil || null,
    })
    brokerFirms.value = await listBrokerFirms()
    brokerPrefilled.value = true
    message.success(t('dt.firmaBrokerSohranenaV'))
  } catch {
    message.error(t('dt.neUdalosSohranitFirmu'))
  } finally {
    brokerSaving.value = false
  }
}
</script>

<style scoped>
.party-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
</style>
