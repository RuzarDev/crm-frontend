<template>
  <div class="dt-section">
    <div class="dt-section-bar"><DtGraphLabel graph="48" text="Отсрочка платежей" /></div>
    <div class="dt-grid-4">
      <a-form-item label="Вид документа">
        <a-input v-uppercase v-model:value="form.deferralDocType" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Номер">
        <a-input v-uppercase v-model:value="form.deferralNumber" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Дата">
        <a-date-picker v-model:value="form.deferralDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Срок">
        <a-date-picker v-model:value="form.deferralDueDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <a-form-item>
      <template #label><DtGraphLabel graph="52" text="Гарантия недействительна для" /></template>
      <a-input v-uppercase v-model:value="form.guaranteeInvalidFor" :disabled="readonly" @change="emitChange" />
    </a-form-item>

    <div class="dt-section-bar party-bar">
      <DtGraphLabel graph="54" text="Место, дата, подписант" />
      <a-button v-if="!readonly" type="link" size="small" :loading="profileLoading" @click="fillFromDeclarantProfile">
        Подставить из профиля
      </a-button>
    </div>
    <div class="dt-grid-3">
      <a-form-item label="ФИО">
        <a-input v-uppercase v-model:value="form.signatoryFullName" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Должность">
        <a-input v-uppercase v-model:value="form.signatoryPosition" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Вид документа">
        <a-select
          v-model:value="form.signatoryDocTypeCode" :options="classifiers.options('id-doc-types')"
          show-search allow-clear :get-popup-container="popupContainer" :disabled="readonly"
          placeholder="21 — Удостоверение личности" style="width: 100%" @change="emitChange"
        />
      </a-form-item>
      <a-form-item label="№ документа">
        <a-input v-uppercase v-model:value="form.signatoryDocNumber" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Дата выдачи">
        <a-date-picker v-model:value="form.signatoryDocIssueDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Кем выдан">
        <a-input v-uppercase v-model:value="form.signatoryDocIssuedBy" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Страна">
        <a-input v-uppercase v-model:value="form.signatoryDocCountryCode" :maxlength="2" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Доверенность (№)">
        <a-input v-uppercase v-model:value="form.powerOfAttorney" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Дата доверенности">
        <a-date-picker v-model:value="form.powerOfAttorneyDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Срок действия доверенности">
        <a-date-picker v-model:value="form.powerOfAttorneyValidUntil" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item label="№ брокерского договора">
        <a-input v-uppercase v-model:value="form.brokerContractNumber" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Документ (текст)">
        <a-input v-uppercase v-model:value="form.signatoryDocument" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Телефон">
        <a-input v-model:value="form.signatoryPhone" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Дата подписания">
        <a-date-picker v-model:value="form.signedDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="54" text="Справочник фирм-брокеров" /></div>
    <div class="dt-grid-3">
      <a-form-item label="БИН фирмы-брокера">
        <a-input-group compact style="display: flex">
          <a-input v-model:value="brokerFirm.bin" :disabled="readonly" placeholder="БИН" style="flex: 1" />
          <a-button v-if="!readonly" :loading="brokerFinding" @click="findBrokerFirm">Найти</a-button>
        </a-input-group>
      </a-form-item>
      <a-form-item label="Наименование фирмы">
        <a-input v-model:value="brokerFirm.name" :disabled="readonly" />
      </a-form-item>
      <a-form-item label="Адрес">
        <a-input v-model:value="brokerFirm.address" :disabled="readonly" />
      </a-form-item>
      <a-form-item label="Дата договора">
        <a-date-picker v-model:value="brokerFirm.contractDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" />
      </a-form-item>
      <a-form-item label="Срок действия">
        <a-date-picker v-model:value="brokerFirm.contractValidUntil" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" />
      </a-form-item>
      <a-form-item label=" ">
        <a-button v-if="!readonly" :loading="brokerSaving" @click="saveBrokerFirm">Сохранить в справочник</a-button>
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { getBrokerFirmByBin, upsertBrokerFirm } from '@/api/brokerFirms'
import { declarantProfileApi } from '@/api/declarantProfile'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'

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
    if (p.fullName) form.signatoryFullName = p.fullName
    if (p.position) form.signatoryPosition = p.position
    if (p.phone) form.signatoryPhone = p.phone
    if (p.powerOfAttorneyNumber) form.powerOfAttorney = p.powerOfAttorneyNumber
    if (p.powerOfAttorneyDate) form.powerOfAttorneyDate = p.powerOfAttorneyDate
    if (p.powerOfAttorneyValidUntil) form.powerOfAttorneyValidUntil = p.powerOfAttorneyValidUntil
    if (p.idDocTypeCode) form.signatoryDocTypeCode = p.idDocTypeCode
    if (p.idDocNumber) form.signatoryDocNumber = p.idDocNumber
    if (p.idDocIssueDate) form.signatoryDocIssueDate = p.idDocIssueDate
    if (p.idDocIssuedBy) form.signatoryDocIssuedBy = p.idDocIssuedBy
    if (p.idDocCountryCode) form.signatoryDocCountryCode = p.idDocCountryCode
    emitChange()
    if (p.fullName || p.powerOfAttorneyNumber || p.idDocNumber) {
      message.success('гр.54 заполнена из профиля декларанта')
    } else {
      message.info('Профиль декларанта пуст — заполните его в разделе «Профиль»')
    }
  } catch {
    message.error('Не удалось загрузить профиль декларанта')
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

const findBrokerFirm = async () => {
  const bin = (brokerFirm.bin || '').trim()
  if (!bin) {
    message.warning('Укажите БИН фирмы-брокера')
    return
  }
  brokerFinding.value = true
  try {
    const firm = await getBrokerFirmByBin(bin)
    if (!firm) {
      message.info('Фирма-брокер с таким БИН не найдена в справочнике')
      return
    }
    brokerFirm.name = firm.name
    brokerFirm.address = firm.address
    brokerFirm.contractDate = firm.contractDate
    brokerFirm.contractValidUntil = firm.contractValidUntil
    // № договора персистится в ДТ (гр.54) — автозаполняем и уведомляем родителя.
    form.brokerContractNumber = firm.contractNumber
    emitChange()
    message.success('Фирма-брокер найдена, № договора подставлен в гр.54')
  } catch {
    message.error('Не удалось выполнить поиск фирмы-брокера')
  } finally {
    brokerFinding.value = false
  }
}

const saveBrokerFirm = async () => {
  const name = (brokerFirm.name || '').trim()
  const bin = (brokerFirm.bin || '').trim()
  if (!name || !bin) {
    message.warning('Для сохранения нужны наименование и БИН фирмы-брокера')
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
    message.success('Фирма-брокер сохранена в справочник')
  } catch {
    message.error('Не удалось сохранить фирму-брокера')
  } finally {
    brokerSaving.value = false
  }
}
</script>

<style scoped>
.party-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
</style>
