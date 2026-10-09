<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhUserCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { declarantProfileApi } from '@/api/declarantProfile'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import { message } from '@/ui/message'
import type { ZOption } from '@/ui/options'
import DtGraphHelp from '../DtGraphHelp.vue'
import { dedupeOptions, withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'
import BrokerFirmPicker from './BrokerFirmPicker.vue'

// Завершение: гр. 48 (отсрочка платежей), гр. 52 (гарантия), гр. 54 (место, дата, подписант) и брокерский договор.
// Подписанта можно подставить из профиля декларанта (текст — UPPERCASE, как при ручном вводе). Страна документа —
// выбор по двухбуквенному коду. В ДТ из блока брокерского договора уходит только номер договора; фирма из справочника
// (BrokerFirmPicker) — вспомогательная. Фактические платежи (гр. B) показывает страница под этим разделом.
const props = defineProps<{ form: DtFormState; readonly: boolean }>()
const { t } = useI18n()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.closing.${key}`, p ?? {})
const classifiers = useClassifiersStore()
const countries = useCountryAlpha2Options()

const docTypes = computed(() => withCurrent(dedupeOptions(classifiers.options('id-doc-types')), props.form.signatoryDocTypeCode))
const country = computed(() => withCurrent(countries.value as ZOption[], props.form.signatoryDocCountryCode))
const warn = (unknown: boolean, value: string | null | undefined) =>
  unknown ? { validateStatus: 'warning' as const, help: t('broker.dt.general.notInList', { value: value ?? '' }) } : {}
const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const filterByLabel = (input: string, o: ZOption) => o.label.toLocaleLowerCase('ru').includes(input.toLocaleLowerCase('ru'))

const profileLoading = ref(false)
const fillFromProfile = async () => {
  profileLoading.value = true
  try {
    const p = await declarantProfileApi.get()
    // Текстовые поля ДТ — UPPERCASE; номера, даты и коды переносим как есть. Пустое поле профиля форму не трогает.
    const up = (v: string) => v.toUpperCase()
    const f = props.form
    if (p.fullName) f.signatoryFullName = up(p.fullName)
    if (p.position) f.signatoryPosition = up(p.position)
    if (p.phone) f.signatoryPhone = p.phone
    if (p.powerOfAttorneyNumber) f.powerOfAttorney = up(p.powerOfAttorneyNumber)
    if (p.powerOfAttorneyDate) f.powerOfAttorneyDate = p.powerOfAttorneyDate
    if (p.powerOfAttorneyValidUntil) f.powerOfAttorneyValidUntil = p.powerOfAttorneyValidUntil
    if (p.idDocTypeCode) f.signatoryDocTypeCode = p.idDocTypeCode
    if (p.idDocNumber) f.signatoryDocNumber = up(p.idDocNumber)
    if (p.idDocIssueDate) f.signatoryDocIssueDate = p.idDocIssueDate
    if (p.idDocIssuedBy) f.signatoryDocIssuedBy = up(p.idDocIssuedBy)
    if (p.idDocCountryCode) f.signatoryDocCountryCode = up(p.idDocCountryCode)
    if (p.fullName || p.powerOfAttorneyNumber || p.idDocNumber) message.success(tc('profileFilled'))
    else message.info(tc('profileEmpty'))
  } catch {
    message.error(tc('profileFailed'))
  } finally {
    profileLoading.value = false
  }
}

const h2 = 'm-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink'
const graphTag = 'font-mono text-xs font-normal text-muted'
const ctl = 'max-sm:h-11'
const boxCtl = 'max-sm:*:h-11'
const grid3 = 'grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3'
</script>

<template>
  <section class="@container flex flex-col gap-6" data-dt-closing>
    <div class="flex flex-col gap-4" data-closing-deferral>
      <h2 :class="h2">
        {{ tc('deferralTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '48' }) }}</span>
        <DtGraphHelp graph="48" />
      </h2>
      <div class="grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-4">
        <ZField graph="48" data-graph="48" :label="tc('deferralDocType')">
          <ZInput v-uppercase :value="form.deferralDocType" :disabled="readonly" :class="ctl" data-deferral-type @update:value="form.deferralDocType = str($event)" />
        </ZField>
        <ZField graph="48" :label="tc('number')">
          <ZInput v-uppercase :value="form.deferralNumber" :disabled="readonly" :class="ctl" data-deferral-number @update:value="form.deferralNumber = str($event)" />
        </ZField>
        <ZField graph="48" :label="tc('date')">
          <ZDate :value="form.deferralDate" allow-clear :disabled="readonly" :class="ctl" data-deferral-date @update:value="form.deferralDate = str($event)" />
        </ZField>
        <ZField graph="48" :label="tc('deferralDue')">
          <ZDate :value="form.deferralDueDate" allow-clear :disabled="readonly" :class="ctl" data-deferral-due @update:value="form.deferralDueDate = str($event)" />
        </ZField>
      </div>
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-closing-guarantee>
      <h2 :class="h2">
        {{ tc('guaranteeTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '52' }) }}</span>
        <DtGraphHelp graph="52" />
      </h2>
      <div class="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <ZField graph="52" data-graph="52" :label="tc('guaranteeInvalid')">
          <ZInput v-uppercase :value="form.guaranteeInvalidFor" :disabled="readonly" :class="ctl" data-guarantee @update:value="form.guaranteeInvalidFor = str($event)" />
        </ZField>
      </div>
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-closing-signatory>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 :class="h2">
          {{ tc('signatoryTitle') }}
          <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '54' }) }}</span>
          <DtGraphHelp graph="54" />
        </h2>
        <ZButton v-if="!readonly" variant="ghost" :loading="profileLoading" class="max-sm:h-11" data-from-profile @click="fillFromProfile">
          <template #icon><PhUserCircle :size="16" aria-hidden="true" /></template>
          {{ tc('fromProfile') }}
        </ZButton>
      </div>
      <div :class="grid3">
        <ZField graph="54" data-graph="54" :label="tc('fullName')">
          <ZInput v-uppercase :value="form.signatoryFullName" :disabled="readonly" :class="ctl" data-signatory-name @update:value="form.signatoryFullName = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('position')">
          <ZInput v-uppercase :value="form.signatoryPosition" :disabled="readonly" :class="ctl" data-signatory-position @update:value="form.signatoryPosition = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('docType')" v-bind="warn(docTypes.unknown, form.signatoryDocTypeCode)">
          <ZSelect :value="form.signatoryDocTypeCode || null" :options="docTypes.options" show-search allow-clear :disabled="readonly" :placeholder="tc('docTypePlaceholder')" popup-width="420px" :class="boxCtl" data-signatory-doctype @update:value="form.signatoryDocTypeCode = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('docNumber')">
          <ZInput v-uppercase :value="form.signatoryDocNumber" :disabled="readonly" :class="ctl" data-signatory-docnumber @update:value="form.signatoryDocNumber = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('docIssueDate')">
          <ZDate :value="form.signatoryDocIssueDate" allow-clear :disabled="readonly" :class="ctl" data-signatory-issuedate @update:value="form.signatoryDocIssueDate = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('docIssuedBy')">
          <ZInput v-uppercase :value="form.signatoryDocIssuedBy" :disabled="readonly" :class="ctl" data-signatory-issuedby @update:value="form.signatoryDocIssuedBy = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('docCountry')" v-bind="warn(country.unknown, form.signatoryDocCountryCode)">
          <ZSelect :value="form.signatoryDocCountryCode || null" :options="country.options" show-search allow-clear :filter-option="filterByLabel" :disabled="readonly" placeholder="KZ" popup-width="320px" :class="boxCtl" data-signatory-country @update:value="form.signatoryDocCountryCode = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('poaNumber')">
          <ZInput v-uppercase :value="form.powerOfAttorney" :disabled="readonly" :class="ctl" data-poa-number @update:value="form.powerOfAttorney = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('poaDate')">
          <ZDate :value="form.powerOfAttorneyDate" allow-clear :disabled="readonly" :class="ctl" data-poa-date @update:value="form.powerOfAttorneyDate = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('poaUntil')">
          <ZDate :value="form.powerOfAttorneyValidUntil" allow-clear :disabled="readonly" :class="ctl" data-poa-until @update:value="form.powerOfAttorneyValidUntil = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('document')">
          <ZInput v-uppercase :value="form.signatoryDocument" :disabled="readonly" :class="ctl" data-signatory-document @update:value="form.signatoryDocument = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('phone')">
          <ZPhone :value="form.signatoryPhone" :disabled="readonly" :class="ctl" data-signatory-phone @update:value="form.signatoryPhone = str($event)" />
        </ZField>
        <ZField graph="54" :label="tc('signedDate')">
          <ZDate :value="form.signedDate" allow-clear :disabled="readonly" :class="ctl" data-signed-date @update:value="form.signedDate = str($event)" />
        </ZField>
      </div>
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-closing-contract>
      <h2 :class="h2">
        {{ tc('contractTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '54' }) }}</span>
      </h2>
      <div class="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <ZField graph="54" :label="tc('contractNumber')" :extra="tc('contractNumberHint')">
          <ZInput v-uppercase :value="form.brokerContractNumber" :disabled="readonly" :class="ctl" data-contract-number @update:value="form.brokerContractNumber = str($event)" />
        </ZField>
      </div>
      <BrokerFirmPicker v-if="!readonly" :contract-number="form.brokerContractNumber" @update:contract-number="form.brokerContractNumber = $event" />
    </div>
  </section>
</template>
