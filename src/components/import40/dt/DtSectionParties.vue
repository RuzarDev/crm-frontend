<template>
  <div class="dt-section">
    <div class="dt-grid-2 dt-checkboxes">
      <a-checkbox v-model:checked="form.consigneeEqualsDeclarant" :disabled="readonly" @change="onConsigneeEqualsDeclarantChange">
        Гр.8 · Согласно гр.14 (получатель)
      </a-checkbox>
      <a-checkbox v-model:checked="form.financialSubjectEqualsDeclarant" :disabled="readonly" @change="onFinancialSubjectEqualsDeclarantChange">
        Гр.9 · Согласно гр.14 (лицо, отв. за фин. урегулирование)
      </a-checkbox>
    </div>

    <div class="dt-section-bar party-bar">
      <DtGraphLabel graph="2" text="Отправитель" />
      <span v-if="!readonly" class="party-ref-actions">
        <a-button type="link" size="small" @click="openPartyPicker('sender')">Из справочника</a-button>
        <a-button type="link" size="small" :loading="partySaving" @click="saveParty('sender')">Сохранить в справочник</a-button>
      </span>
    </div>
    <div class="dt-grid-3">
      <a-form-item label="Полное наименование"><a-input v-uppercase v-model:value="form.sender.name" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Краткое наименование"><a-input v-uppercase v-model:value="form.senderShortName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.sender.countryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-uppercase v-model:value="form.sender.city" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-uppercase v-model:value="form.sender.region" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.sender.street" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.senderHouse" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Квартира"><a-input v-uppercase v-model:value="form.senderApt" :disabled="readonly" @change="emitChange" /></a-form-item>
    </div>

    <!-- Гр.8: как гр.9 — при «Согласно гр.14» блок скрывается целиком, а не серым -->
    <template v-if="!form.consigneeEqualsDeclarant">
    <div class="dt-section-bar party-bar">
      <DtGraphLabel graph="8" text="Получатель" />
      <span v-if="!readonly" class="party-ref-actions">
        <a-button v-if="clientProfile" type="link" size="small" @click="fillReceiverFromClient">Из профиля клиента</a-button>
        <a-button type="link" size="small" @click="openPartyPicker('receiver')">Из справочника</a-button>
        <a-button type="link" size="small" :loading="partySaving" @click="saveParty('receiver')">Сохранить в справочник</a-button>
      </span>
    </div>
    <div class="dt-grid-3">
      <a-form-item label="Полное наименование"><a-input v-uppercase v-model:value="form.receiver.name" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Краткое наименование"><a-input v-uppercase v-model:value="form.receiverShortName" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="БИН"><a-input v-model:value="form.receiverBin" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.receiver.countryCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-uppercase v-model:value="form.receiver.city" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-uppercase v-model:value="form.receiver.region" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.receiver.street" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.receiverHouse" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Квартира"><a-input v-uppercase v-model:value="form.receiverApt" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Категория">
        <a-select v-model:value="form.receiverCategoryCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="classifiers.options('itn-categories')" @change="emitChange" />
      </a-form-item>
      <a-form-item label="КАТО">
        <a-select v-model:value="form.receiverKatoCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="classifiers.options('kato')" @change="emitChange" />
      </a-form-item>
    </div>
    </template>

    <template v-if="!form.financialSubjectEqualsDeclarant">
      <div class="dt-section-bar"><DtGraphLabel graph="9" text="Лицо, ответственное за фин. урегулирование" /></div>
      <div class="dt-grid-3">
        <a-form-item label="Полное наименование"><a-input v-uppercase v-model:value="form.financialSubjectName" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Краткое наименование"><a-input v-uppercase v-model:value="form.financialSubjectShortName" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="БИН"><a-input v-model:value="form.financialSubjectBin" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Страна">
          <a-select v-model:value="form.financialSubjectCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
        </a-form-item>
        <a-form-item label="Город"><a-input v-uppercase v-model:value="form.financialSubjectCity" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Область"><a-input v-uppercase v-model:value="form.financialSubjectRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.financialSubjectStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.financialSubjectHouse" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Квартира"><a-input v-uppercase v-model:value="form.financialSubjectApt" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Категория">
          <a-select v-model:value="form.financialSubjectCategoryCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('itn-categories')" @change="emitChange" />
        </a-form-item>
        <a-form-item label="КАТО">
          <a-select v-model:value="form.financialSubjectKatoCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('kato')" @change="emitChange" />
        </a-form-item>
      </div>
    </template>

    <div class="dt-section-bar"><DtGraphLabel graph="14" text="Декларант" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Полное наименование"><a-input v-uppercase v-model:value="form.declarantName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Краткое наименование"><a-input v-uppercase v-model:value="form.declarantShortName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="БИН"><a-input v-model:value="form.declarantBin" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.declarantCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" option-filter-prop="label" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-uppercase v-model:value="form.declarantCity" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-uppercase v-model:value="form.declarantRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.declarantStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.declarantHouse" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Квартира"><a-input v-uppercase v-model:value="form.declarantApt" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Категория">
        <a-select v-model:value="form.declarantCategoryCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('itn-categories')" @change="emitChange" />
      </a-form-item>
      <a-form-item label="КАТО">
        <a-select v-model:value="form.declarantKatoCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('kato')" @change="emitChange" />
      </a-form-item>
    </div>

    <a-modal v-model:open="partyPickerOpen" :width="640"
      :title="partyPickerTarget === 'sender' ? 'Справочник отправителей' : 'Справочник получателей'" :footer="null">
      <a-input-search v-model:value="partyQuery" placeholder="Поиск по наименованию или БИН" allow-clear
        :loading="partyLoading" @search="searchParties" @change="searchParties" style="margin-bottom: 12px" />
      <a-list size="small" :data-source="partyResults" :loading="partyLoading">
        <template #renderItem="{ item }">
          <a-list-item class="party-ref-row" @click="applyParty(item)">
            <div>
              <div class="party-ref-name">{{ item.name }}</div>
              <div class="party-ref-sub">
                <span v-if="item.bin">БИН {{ item.bin }} · </span>{{ [item.countryCode, item.city, item.street, item.house].filter(Boolean).join(', ') || '—' }}
              </div>
            </div>
          </a-list-item>
        </template>
        <template #footer v-if="!partyLoading && !partyResults.length">
          <span class="party-ref-empty">Ничего не найдено — сохраните текущую сторону кнопкой «Сохранить в справочник».</span>
        </template>
      </a-list>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { partyRefsApi, type PartyRefDto } from '@/api/partyRefs'
import type { ClientCompanyProfileDto } from '@/api/import40Contract'
import type { Import40DtFormState, Import40Party } from '@/api/import40'
import './dt-sections.css'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  countryOptions?: { value: string; label: string }[]
  clientProfile?: ClientCompanyProfileDto | null
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()

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
  if (partyPickerTarget.value === 'sender') {
    form.sender = { ...form.sender, name: r.name, countryCode: r.countryCode, region: r.region, city: r.city, street: r.street }
    form.senderShortName = r.shortName ?? null
    form.senderHouse = r.house ?? null
    form.senderApt = r.apt ?? null
  } else {
    form.receiver = { ...form.receiver, name: r.name, countryCode: r.countryCode, region: r.region, city: r.city, street: r.street }
    form.receiverShortName = r.shortName ?? null
    form.receiverBin = r.bin ?? null
    form.receiverHouse = r.house ?? null
    form.receiverApt = r.apt ?? null
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
  form.receiver = {
    ...form.receiver,
    name: p.companyName ?? null,
    countryCode: p.legalCountryCode ?? form.receiver.countryCode ?? null,
    region: p.legalRegion ?? null,
    city: p.legalCity ?? null,
    street: p.legalStreet ?? null,
  }
  form.receiverBin = p.bin ?? null
  emitChange()
  message.success('Получатель заполнен из профиля клиента')
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
    message.warning('Заполните наименование стороны перед сохранением в справочник')
    return
  }
  partySaving.value = true
  try {
    await partyRefsApi.upsert(body)
    message.success('Сохранено в справочник сторон')
  } catch {
    message.error('Не удалось сохранить в справочник')
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
.party-ref-row:hover { background: var(--atg-teal-soft, #e6f7fb); }
.party-ref-name { font-weight: 600; color: var(--atg-ink, #182640); font-size: 13.5px; }
.party-ref-sub { font-size: 12px; color: var(--atg-muted, #95a1b7); margin-top: 1px; }
.party-ref-empty { font-size: 12.5px; color: var(--atg-muted, #95a1b7); }
</style>
