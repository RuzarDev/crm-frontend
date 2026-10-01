<template>
  <div class="dt-section">
    <div class="dt-grid-2 dt-checkboxes">
      <a-checkbox v-model:checked="form.consigneeEqualsDeclarant" :disabled="readonly" @change="onConsigneeEqualsDeclarantChange"> {{ t('dt.gr8SoglasnoGr14Poluchatel') }} </a-checkbox>
      <a-checkbox v-model:checked="form.financialSubjectEqualsDeclarant" :disabled="readonly" @change="onFinancialSubjectEqualsDeclarantChange"> {{ t('dt.gr9SoglasnoGr14Lico') }} </a-checkbox>
    </div>

    <div class="dt-section-bar party-bar">
      <DtGraphLabel graph="2" :text="t('dt.otpravitel')" />
      <span v-if="!readonly" class="party-ref-actions">
        <a-button type="link" size="small" @click="openPartyPicker('sender')">{{ t('dt.izSpravochnika') }}</a-button>
        <a-button type="link" size="small" :loading="partySaving" @click="saveParty('sender')">{{ t('dt.sohranitVSpravochnik') }}</a-button>
      </span>
    </div>
    <div class="dt-grid-3">
      <a-form-item :label="t('dt.polnoeNaimenovanie')"><a-input v-uppercase v-model:value="form.sender.name" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kratkoeNaimenovanie')"><a-input v-uppercase v-model:value="form.senderShortName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.strana')">
        <a-select v-model:value="form.sender.countryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.gorod')"><a-input v-uppercase v-model:value="form.sender.city" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.oblast')"><a-input v-uppercase v-model:value="form.sender.region" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.rajon')"><a-input v-uppercase v-model:value="form.senderDistrict" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.ulica')"><a-input v-uppercase v-model:value="form.sender.street" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.dom')" :extra="t('dt.domPodskazka')" :validate-status="tooLong(form.senderHouse) ? 'error' : undefined" :help="tooLong(form.senderHouse) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.senderHouse" :maxlength="MAX_HOUSE_LEN" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kvartira')" :extra="t('dt.kvartiraPodskazka')" :validate-status="tooLong(form.senderApt) ? 'error' : undefined" :help="tooLong(form.senderApt) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.senderApt" :maxlength="MAX_HOUSE_LEN" :disabled="readonly" @change="emitChange" /></a-form-item>
    </div>

    <!-- Гр.8: как гр.9 — при «Согласно гр.14» блок скрывается целиком, а не серым -->
    <template v-if="!form.consigneeEqualsDeclarant">
    <div class="dt-section-bar party-bar">
      <DtGraphLabel graph="8" :text="t('dt.poluchatel')" />
      <span v-if="!readonly" class="party-ref-actions">
        <a-button v-if="clientProfile" type="link" size="small" @click="fillReceiverFromClient">{{ t('dt.izProfilyaKlienta') }}</a-button>
        <a-button type="link" size="small" @click="openPartyPicker('receiver')">{{ t('dt.izSpravochnika') }}</a-button>
        <a-button type="link" size="small" :loading="partySaving" @click="saveParty('receiver')">{{ t('dt.sohranitVSpravochnik') }}</a-button>
      </span>
    </div>
    <div class="dt-grid-3">
      <a-form-item :label="t('dt.polnoeNaimenovanie')"><a-input v-uppercase v-model:value="form.receiver.name" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kratkoeNaimenovanie')"><a-input v-uppercase v-model:value="form.receiverShortName" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.bin')"><div class="bin-row"><a-input v-model:value="form.receiverBin" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /><BinLookupButton v-if="!readonly && !form.consigneeEqualsDeclarant" :bin="form.receiverBin" @found="(c) => applyLookup('receiver', c)" /></div></a-form-item>
      <a-form-item :label="t('dt.strana')">
        <a-select v-model:value="form.receiver.countryCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.gorod')"><a-input v-uppercase v-model:value="form.receiver.city" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.oblast')"><a-input v-uppercase v-model:value="form.receiver.region" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.rajon')"><a-input v-uppercase v-model:value="form.receiverDistrict" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.ulica')"><a-input v-uppercase v-model:value="form.receiver.street" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.dom')" :extra="t('dt.domPodskazka')" :validate-status="tooLong(form.receiverHouse) ? 'error' : undefined" :help="tooLong(form.receiverHouse) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.receiverHouse" :maxlength="MAX_HOUSE_LEN" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kvartira')" :extra="t('dt.kvartiraPodskazka')" :validate-status="tooLong(form.receiverApt) ? 'error' : undefined" :help="tooLong(form.receiverApt) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.receiverApt" :maxlength="MAX_HOUSE_LEN" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kategoriya')">
        <a-select v-model:value="form.receiverCategoryCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="classifiers.options('itn-categories')" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.kato')">
        <KatoSelect v-model:value="form.receiverKatoCode" :disabled="readonly || !!form.consigneeEqualsDeclarant" @change="emitChange" />
      </a-form-item>
    </div>
    </template>

    <template v-if="!form.financialSubjectEqualsDeclarant">
      <div class="dt-section-bar"><DtGraphLabel graph="9" :text="t('dt.licoOtvetstvennoeZaFin')" /></div>
      <div class="dt-grid-3">
        <a-form-item :label="t('dt.polnoeNaimenovanie')"><a-input v-uppercase v-model:value="form.financialSubjectName" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.kratkoeNaimenovanie')"><a-input v-uppercase v-model:value="form.financialSubjectShortName" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.bin')"><div class="bin-row"><a-input v-model:value="form.financialSubjectBin" :disabled="readonly" @change="emitChange" /><BinLookupButton v-if="!readonly" :bin="form.financialSubjectBin" @found="(c) => applyLookup('financialSubject', c)" /></div></a-form-item>
        <a-form-item :label="t('dt.strana')">
          <a-select v-model:value="form.financialSubjectCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
        </a-form-item>
        <a-form-item :label="t('dt.gorod')"><a-input v-uppercase v-model:value="form.financialSubjectCity" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.oblast')"><a-input v-uppercase v-model:value="form.financialSubjectRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.rajon')"><a-input v-uppercase v-model:value="form.financialSubjectDistrict" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.ulica')"><a-input v-uppercase v-model:value="form.financialSubjectStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.dom')" :extra="t('dt.domPodskazka')" :validate-status="tooLong(form.financialSubjectHouse) ? 'error' : undefined" :help="tooLong(form.financialSubjectHouse) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.financialSubjectHouse" :maxlength="MAX_HOUSE_LEN" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.kvartira')" :extra="t('dt.kvartiraPodskazka')" :validate-status="tooLong(form.financialSubjectApt) ? 'error' : undefined" :help="tooLong(form.financialSubjectApt) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.financialSubjectApt" :maxlength="MAX_HOUSE_LEN" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item :label="t('dt.kategoriya')">
          <a-select v-model:value="form.financialSubjectCategoryCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('itn-categories')" @change="emitChange" />
        </a-form-item>
        <a-form-item :label="t('dt.kato')">
          <KatoSelect v-model:value="form.financialSubjectKatoCode" :disabled="readonly" @change="emitChange" />
        </a-form-item>
      </div>
    </template>

    <div class="dt-section-bar"><DtGraphLabel graph="14" :text="t('dt.deklarant')" /></div>
    <div class="dt-grid-3">
      <a-form-item :label="t('dt.polnoeNaimenovanie')"><a-input v-uppercase v-model:value="form.declarantName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kratkoeNaimenovanie')"><a-input v-uppercase v-model:value="form.declarantShortName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.bin')"><div class="bin-row"><a-input v-model:value="form.declarantBin" :disabled="readonly" @change="emitChange" /><BinLookupButton v-if="!readonly" :bin="form.declarantBin" @found="(c) => applyLookup('declarant', c)" /></div></a-form-item>
      <a-form-item :label="t('dt.strana')">
        <a-select v-model:value="form.declarantCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.gorod')"><a-input v-uppercase v-model:value="form.declarantCity" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.oblast')"><a-input v-uppercase v-model:value="form.declarantRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.rajon')"><a-input v-uppercase v-model:value="form.declarantDistrict" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.ulica')"><a-input v-uppercase v-model:value="form.declarantStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.dom')" :extra="t('dt.domPodskazka')" :validate-status="tooLong(form.declarantHouse) ? 'error' : undefined" :help="tooLong(form.declarantHouse) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.declarantHouse" :maxlength="MAX_HOUSE_LEN" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kvartira')" :extra="t('dt.kvartiraPodskazka')" :validate-status="tooLong(form.declarantApt) ? 'error' : undefined" :help="tooLong(form.declarantApt) ? t('dt.dlinnee20') : undefined"><a-input v-uppercase v-model:value="form.declarantApt" :maxlength="MAX_HOUSE_LEN" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item :label="t('dt.kategoriya')">
        <a-select v-model:value="form.declarantCategoryCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('itn-categories')" @change="emitChange" />
      </a-form-item>
      <a-form-item :label="t('dt.kato')">
        <KatoSelect v-model:value="form.declarantKatoCode" :disabled="readonly" @change="emitChange" />
      </a-form-item>
    </div>

    <a-modal v-model:open="partyPickerOpen" :width="760"
      :title="partyPickerTarget === 'sender' ? t('dt.spravochnikOtpraviteley') : t('dt.spravochnikPoluchateley')" :footer="null">
      <a-input-search v-model:value="partyQuery" :placeholder="t('dt.poiskPoNaimenovaniyuIli')" allow-clear
        :loading="partyLoading" @search="searchParties" @change="searchParties" style="margin-bottom: 12px" />
      <a-list size="small" :data-source="partyResults" :loading="partyLoading">
        <template #renderItem="{ item }">
          <a-list-item class="party-ref-row" @click="applyParty(item)">
            <div>
              <div class="party-ref-name">{{ item.name }}</div>
              <div class="party-ref-sub">
                <span v-if="item.bin">{{ t('dt.bin') }} {{ item.bin }} · </span>{{ [item.countryCode, item.city, item.street, item.house].filter(Boolean).join(', ') || '—' }}
              </div>
            </div>
          </a-list-item>
        </template>
        <template #footer v-if="!partyLoading && (!partyResults.length || partyQueryIsBin)">
          <div class="party-ref-footer">
            <span v-if="!partyResults.length" class="party-ref-empty">{{ t('dt.nichegoNeNaydenoSohranite') }}</span>
            <BinLookupButton v-if="partyQueryIsBin" :bin="partyQuery" type="primary" @found="applyLookupFromPicker"> {{ t('dt.naytiVGbdYul') }} </BinLookupButton>
          </div>
        </template>
      </a-list>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { partyRefsApi, type PartyRefDto } from '@/api/partyRefs'
import BinLookupButton from '@/components/BinLookupButton.vue'
import KatoSelect from '@/components/KatoSelect.vue'
import { isBinLike, type CompanyLookupDto } from '@/api/companyLookup'
import { EMPTY_PARSED_KZ_ADDRESS, parseKzAddress } from '@/utils/kzAddress'
import type { ClientCompanyProfileDto } from '@/api/import40Contract'
import type { Import40DtFormState, Import40Party } from '@/api/import40'
import './dt-sections.css'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  countryOptions?: { value: string; label: string }[]
  clientProfile?: ClientCompanyProfileDto | null
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()

// КЕДЕН отвергает дом/офис длиннее 20 знаков (BuildingNumberId/RoomNumberId). Поле не даёт ввести больше,
// но старые длинные значения не обрезаем молча — подсвечиваем ошибкой (то же правило в KedenXmlReadiness).
const MAX_HOUSE_LEN = 20
const tooLong = (v: string | null | undefined) => (v?.trim().length ?? 0) > MAX_HOUSE_LEN

// Локальная копия эмита emptyParty() из Import40DtView.vue — там она не
// экспортируется, поэтому дублируем форму по типу Import40Party.
function emptyParty(): Import40Party {
  return {
    name: null,
    countryCode: null,
    region: null,
    city: null,
    street: null,
  }
}

function buildForm(v: Import40DtFormState) {
  return {
    ...v,
    sender: { ...(v.sender ?? emptyParty()) },
    receiver: { ...(v.receiver ?? emptyParty()) },
  }
}

const form = reactive(buildForm(props.modelValue))

// Реентерабельность копирования декларант→получатель/фин.лицо не защищена
// флагом-guard'ом — она и не нужна: поток данных однонаправленный.
// - Этот watch на props.modelValue только присваивает в локальный `form`,
//   он никогда не вызывает emitChange(), поэтому не может сам запустить
//   ещё один цикл копирования.
// - copyDeclarantToReceiver()/copyDeclarantToFinancialSubject() пишут
//   только в receiver*/financialSubject*-поля и никогда — в declarant*-поля,
//   поэтому watch на declarant-поля ниже не перезапускается их же копированием.
// Если это свойство когда-нибудь изменится (например, копирование начнёт
// писать в declarant* или этот watch начнёт эмитить), нужно будет вернуть
// guard явно.
watch(
  () => props.modelValue,
  (v) => Object.assign(form, buildForm(v)),
  { deep: true },
)

const emitChange = () =>
  emit('update:modelValue', {
    ...props.modelValue,
    ...form,
    sender: { ...form.sender },
    receiver: { ...form.receiver },
  })

// ── Справочник сторон (№6): сохранить/подставить отправителя и получателя ──
type PartyTarget = 'sender' | 'receiver'
const partyPickerOpen = ref(false)
const partyPickerTarget = ref<PartyTarget>('receiver')
const partyQuery = ref('')
const partyResults = ref<PartyRefDto[]>([])
const partyLoading = ref(false)
const partySaving = ref(false)

const openPartyPicker = async (target: PartyTarget) => {
  partyPickerTarget.value = target
  partyPickerOpen.value = true
  partyQuery.value = target === 'sender' ? (form.sender.name ?? '') : (form.receiver.name ?? '')
  await searchParties()
}
const searchParties = async () => {
  partyLoading.value = true
  try {
    partyResults.value = await partyRefsApi.search(partyQuery.value.trim())
  } catch {
    partyResults.value = []
  } finally {
    partyLoading.value = false
  }
}
const applyParty = (r: PartyRefDto) => {
  const up = (v: string | null | undefined) => (v ? v.toUpperCase() : null) // текст ДТ — UPPERCASE
  if (partyPickerTarget.value === 'sender') {
    form.sender = { ...form.sender, name: up(r.name), countryCode: r.countryCode, region: up(r.region), city: up(r.city), street: up(r.street) }
    form.senderShortName = up(r.shortName)
    form.senderDistrict = null // в справочнике сторон района нет
    form.senderHouse = up(r.house)
    form.senderApt = up(r.apt)
  } else {
    form.receiver = { ...form.receiver, name: up(r.name), countryCode: r.countryCode, region: up(r.region), city: up(r.city), street: up(r.street) }
    form.receiverShortName = up(r.shortName)
    form.receiverDistrict = null
    form.receiverBin = r.bin ?? null
    form.receiverHouse = up(r.house)
    form.receiverApt = up(r.apt)
    form.receiverCategoryCode = r.categoryCode ?? null
    form.receiverKatoCode = r.katoCode ?? null
  }
  emitChange()
  partyPickerOpen.value = false
}
// №12: заполнить получателя (гр.8) из профиля компании клиента.
const fillReceiverFromClient = () => {
  const p = props.clientProfile
  if (!p) return
  // Пакет 6 №3: заполняем максимум доступного, чтобы поля не оставались пустыми.
  // Профиль компании не всегда содержит разобранный адрес — если структурных
  // частей нет, кладём свободный legalAddress в «Улицу»; страна по умолчанию KZ.
  const hasStructured = !!(p.legalCity || p.legalStreet || p.legalRegion)
  const up = (v: string | null | undefined) => (v ? v.toUpperCase() : null) // текст ДТ — UPPERCASE
  // Свободный адрес и «улица с домом» разбираем на район/улицу/дом/помещение (utils/kzAddress),
  // чтобы в КЕДЕН уходили отдельные поля, а не строка целиком в «Улице».
  const parsed = !hasStructured && p.legalAddress
    ? parseKzAddress(p.legalAddress)
    : p.legalStreet ? parseKzAddress(p.legalStreet) : EMPTY_PARSED_KZ_ADDRESS
  form.receiver = {
    ...form.receiver,
    name: up(p.companyName),
    countryCode: p.legalCountryCode || form.receiver.countryCode || 'KZ',
    region: up(p.legalRegion || parsed.region),
    city: up(p.legalCity || parsed.city),
    street: up(parsed.street ?? (p.legalStreet || null)),
  }
  if (parsed.district) form.receiverDistrict = up(parsed.district)
  if (parsed.house) form.receiverHouse = up(parsed.house)
  if (parsed.apt) form.receiverApt = up(parsed.apt)
  form.receiverShortName = form.receiverShortName || up(p.companyName)
  form.receiverBin = p.bin ?? null
  emitChange()
  message.success(t('dt.poluchatelZapolnenIzProfilya'))
}

// «Найти по БИН» (ГБД ЮЛ, data.egov.kz) для гр.8/9/14: наименование — перезаписываем
// (явный запрос), краткое наименование/адрес — только пустые (адрес разбирается
// эвристически из строки реестра, см. parseKzAddress), страна — KZ.
type LookupTarget = 'sender' | 'receiver' | 'financialSubject' | 'declarant'
const applyLookup = (target: LookupTarget, c: CompanyLookupDto) => {
  const name = (c.nameRu ?? c.nameKz ?? '').toUpperCase() || null
  const addr = c.addressRu ?? c.addressKz ?? null
  const p = addr ? parseKzAddress(addr) : EMPTY_PARSED_KZ_ADDRESS
  // область — в «Область», район — в «Район» (csdo:DistrictName), дом и помещение — в свои поля
  const region = p.region
  const up = (s: string | null) => (s ? s.toUpperCase() : null)
  if (target === 'sender' || target === 'receiver') {
    const party = target === 'sender' ? form.sender : form.receiver
    if (name) party.name = name
    party.countryCode = party.countryCode || 'KZ'
    if (!party.region && region) party.region = up(region)
    if (!party.city && p.city) party.city = up(p.city)
    if (!party.street && p.street) party.street = up(p.street)
    if (target === 'receiver') {
      form.receiverShortName = form.receiverShortName || name
      if (!form.receiverDistrict && p.district) form.receiverDistrict = up(p.district)
      if (!form.receiverHouse && p.house) form.receiverHouse = up(p.house)
      if (!form.receiverApt && p.apt) form.receiverApt = up(p.apt)
    } else {
      form.senderShortName = form.senderShortName || name
      if (!form.senderDistrict && p.district) form.senderDistrict = up(p.district)
      if (!form.senderHouse && p.house) form.senderHouse = up(p.house)
      if (!form.senderApt && p.apt) form.senderApt = up(p.apt)
    }
  } else if (target === 'financialSubject') {
    if (name) form.financialSubjectName = name
    form.financialSubjectShortName = form.financialSubjectShortName || name
    form.financialSubjectCountryCode = form.financialSubjectCountryCode || 'KZ'
    if (!form.financialSubjectRegion && region) form.financialSubjectRegion = up(region)
    if (!form.financialSubjectDistrict && p.district) form.financialSubjectDistrict = up(p.district)
    if (!form.financialSubjectCity && p.city) form.financialSubjectCity = up(p.city)
    if (!form.financialSubjectStreet && p.street) form.financialSubjectStreet = up(p.street)
    if (!form.financialSubjectHouse && p.house) form.financialSubjectHouse = up(p.house)
    if (!form.financialSubjectApt && p.apt) form.financialSubjectApt = up(p.apt)
  } else {
    if (name) form.declarantName = name
    form.declarantShortName = form.declarantShortName || name
    form.declarantCountryCode = form.declarantCountryCode || 'KZ'
    if (!form.declarantRegion && region) form.declarantRegion = up(region)
    if (!form.declarantDistrict && p.district) form.declarantDistrict = up(p.district)
    if (!form.declarantCity && p.city) form.declarantCity = up(p.city)
    if (!form.declarantStreet && p.street) form.declarantStreet = up(p.street)
    if (!form.declarantHouse && p.house) form.declarantHouse = up(p.house)
    if (!form.declarantApt && p.apt) form.declarantApt = up(p.apt)
  }
  emitChange()
}

// Справочник сторон: если в строке поиска 12 цифр — предлагаем найти в ГБД ЮЛ и сразу
// подставить в текущую сторону (sender/receiver) с БИН.
const partyQueryIsBin = computed(() => isBinLike(partyQuery.value))
const applyLookupFromPicker = (c: CompanyLookupDto) => {
  applyLookup(partyPickerTarget.value, c)
  if (partyPickerTarget.value === 'receiver') form.receiverBin = c.bin
  emitChange()
  partyPickerOpen.value = false
}

const saveParty = async (target: PartyTarget) => {
  const body = target === 'sender'
    ? {
        name: form.sender.name ?? '', shortName: form.senderShortName ?? null, bin: null,
        countryCode: form.sender.countryCode ?? null, city: form.sender.city ?? null,
        region: form.sender.region ?? null, street: form.sender.street ?? null,
        house: form.senderHouse ?? null, apt: form.senderApt ?? null, categoryCode: null, katoCode: null,
      }
    : {
        name: form.receiver.name ?? '', shortName: form.receiverShortName ?? null, bin: form.receiverBin ?? null,
        countryCode: form.receiver.countryCode ?? null, city: form.receiver.city ?? null,
        region: form.receiver.region ?? null, street: form.receiver.street ?? null,
        house: form.receiverHouse ?? null, apt: form.receiverApt ?? null,
        categoryCode: form.receiverCategoryCode ?? null, katoCode: form.receiverKatoCode ?? null,
      }
  if (!body.name.trim()) {
    message.warning(t('dt.zapolniteNaimenovanieStoronyPered'))
    return
  }
  partySaving.value = true
  try {
    await partyRefsApi.upsert(body)
    message.success(t('dt.sohranenoVSpravochnikStoron'))
  } catch {
    message.error(t('dt.neUdalosSohranitV'))
  } finally {
    partySaving.value = false
  }
}

// Копирует набор полей декларанта (гр.14) в получателя (гр.8).
function copyDeclarantToReceiver() {
  form.receiver = {
    ...form.receiver,
    name: form.declarantName ?? null,
    countryCode: form.declarantCountryCode ?? null,
    region: form.declarantRegion ?? null,
    city: form.declarantCity ?? null,
    street: form.declarantStreet ?? null,
  }
  form.receiverDistrict = form.declarantDistrict ?? null
  form.receiverHouse = form.declarantHouse ?? null
  form.receiverApt = form.declarantApt ?? null
  form.receiverBin = form.declarantBin ?? null
  form.receiverCategoryCode = form.declarantCategoryCode ?? null
  form.receiverKatoCode = form.declarantKatoCode ?? null
  form.receiverShortName = form.declarantShortName ?? null
}

// Копирует набор полей декларанта (гр.14) в лицо, ответственное за
// фин. урегулирование (гр.9).
function copyDeclarantToFinancialSubject() {
  form.financialSubjectName = form.declarantName ?? null
  form.financialSubjectBin = form.declarantBin ?? null
  form.financialSubjectCountryCode = form.declarantCountryCode ?? null
  form.financialSubjectRegion = form.declarantRegion ?? null
  form.financialSubjectCity = form.declarantCity ?? null
  form.financialSubjectStreet = form.declarantStreet ?? null
  form.financialSubjectDistrict = form.declarantDistrict ?? null
  form.financialSubjectHouse = form.declarantHouse ?? null
  form.financialSubjectApt = form.declarantApt ?? null
  form.financialSubjectCategoryCode = form.declarantCategoryCode ?? null
  form.financialSubjectKatoCode = form.declarantKatoCode ?? null
  form.financialSubjectShortName = form.declarantShortName ?? null
}

function runAutocopy(fn: () => void) {
  fn()
  emitChange()
}

const onConsigneeEqualsDeclarantChange = () => {
  if (form.consigneeEqualsDeclarant) runAutocopy(copyDeclarantToReceiver)
  else emitChange()
}

const onFinancialSubjectEqualsDeclarantChange = () => {
  if (form.financialSubjectEqualsDeclarant) runAutocopy(copyDeclarantToFinancialSubject)
  else emitChange()
}

// Пока галочка включена, любое изменение полей декларанта должно тут же
// перетекать в получателя/фин.лицо — сравниваем по значению (не deep-объект
// целиком), чтобы не дёргать копирование на каждый watch тика без реальных
// изменений.
watch(
  () => [
    form.declarantName,
    form.declarantBin,
    form.declarantCountryCode,
    form.declarantRegion,
    form.declarantDistrict,
    form.declarantCity,
    form.declarantStreet,
    form.declarantHouse,
    form.declarantApt,
    form.declarantCategoryCode,
    form.declarantKatoCode,
    form.declarantShortName,
  ],
  () => {
    // copyDeclarantTo*() ниже не трогает declarant*-поля, так что этот watch
    // не может сам себя перезапустить — guard не нужен (см. комментарий
    // у watch(() => props.modelValue, …) выше).
    if (form.consigneeEqualsDeclarant) runAutocopy(copyDeclarantToReceiver)
    if (form.financialSubjectEqualsDeclarant) runAutocopy(copyDeclarantToFinancialSubject)
  },
)

// На загрузке существующей ДТ с уже включённой галочкой держим гр.8/9
// в актуальном состоянии на случай, если декларант поменялся, пока
// значения не пересохранялись (readonly-поля иначе могли бы показать
// устаревшие данные). Обязательно через runAutocopy()/emitChange() —
// иначе исправление остаётся только в локальном `form` и не долетает до
// dtForm родителя (Import40DtView.saveDt() читает из dtForm, а не из form
// этого компонента), и при сохранении без правки других полей в базу
// уйдут устаревшие receiver/financialSubject значения.
onMounted(() => {
  if (form.consigneeEqualsDeclarant) runAutocopy(copyDeclarantToReceiver)
  if (form.financialSubjectEqualsDeclarant) runAutocopy(copyDeclarantToFinancialSubject)
})
</script>

<style scoped>
.party-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.party-ref-actions { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.party-ref-row { cursor: pointer; border-radius: 8px; padding: 6px 8px; transition: background .12s; }
.party-ref-row:hover { background: var(--z-teal-soft); }
.party-ref-name { font-weight: 600; color: var(--z-ink); font-size: 13.5px; }
.party-ref-sub { font-size: 12px; color: var(--z-muted); margin-top: 1px; }
.party-ref-empty { font-size: 12.5px; color: var(--z-muted); }
.party-ref-footer { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.bin-row { display: flex; gap: 6px; align-items: center; }
.bin-row .ant-input { flex: 1; min-width: 0; }
</style>
