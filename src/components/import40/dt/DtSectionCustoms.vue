<template>
  <div class="dt-section">
    <div class="dt-grid-2">
      <a-form-item>
        <template #label><DtGraphLabel graph="29" :text="t('dt.postNaGranice')" /></template>
        <a-select
          v-model:value="form.borderCustomsOfficeName" :options="borderPostSelectOptions" :disabled="readonly"
          show-search allow-clear :filter-option="filterPost" :placeholder="t('dt.kodIliNazvaniePosta')"
          :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '560px' }" style="width: 100%"
          @change="onBorderPostChange"
        />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="30" :text="t('dt.mestoNahozhdeniyaTovarov')" /></template>
        <a-input-group compact style="display: flex">
          <a-auto-complete
            v-model:value="form.goodsLocationCode" :options="classifiers.options('goods-locations')"
            :disabled="readonly" placeholder="11" style="flex: 1" @change="emitChange"
          />
          <a-button
            v-if="!readonly && canAddGoodsLocation" :loading="addingGoodsLocation" :title="t('dt.sohranitVSpravochnik')"
            @click="addGoodsLocation"
          > {{ t('dt.sohranitVSpravochnik2') }} </a-button>
        </a-input-group>
      </a-form-item>
      <!-- Номер из реестров СВХ/ТС КГД: подсказка по номеру, названию, БИН; ручной ввод остаётся (реестр стареет).
           Формат и контрольные цифры проверяются локально — предупреждение, не блокировка. -->
      <a-form-item
        :validate-status="numberHelp ? 'warning' : undefined"
        :help="numberHelp ?? undefined"
      >
        <template #label><DtGraphLabel graph="30" :text="t('dt.nomerSvh')" /></template>
        <a-auto-complete
          :value="form.goodsLocationRegisterNumber ?? undefined" :options="registryOptions" :filter-option="false"
          :disabled="readonly" :placeholder="t('dt.regNomerSvh')" :dropdown-match-select-width="false"
          :dropdown-style="{ minWidth: '420px', maxWidth: '620px' }" style="width: 100%"
          @search="onRegistrySearch" @select="onRegistrySelect" @update:value="onRegisterNumberInput"
        >
          <template #option="{ number, owner, sub, kindLabel, suspended }">
            <div class="reg-opt">
              <div><b>{{ number }}</b> <span class="reg-kind">{{ kindLabel }}</span>
                <a-tag v-if="suspended" color="orange" class="reg-tag">{{ t('dt.svhPriostanovleno') }}</a-tag></div>
              <div class="reg-sub">{{ owner }}<template v-if="sub"> · {{ sub }}</template></div>
            </div>
          </template>
        </a-auto-complete>
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" :text="t('dt.stranaMestaTovarov')" /></template>
        <a-select v-model:value="form.goodsLocationCountryCode" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <!-- Орган места нахождения (csdo:CustomsOfficeCode гр.30) может отличаться от поста подачи (эталон КЕДЕН: подача 55302,
         местонахождение 55300). Пусто — в XML и бланк уходит пост подачи. При выборе склада из реестра орган
         подставляется из НСИ КГД по БИН; если органов несколько — показываем варианты. -->
    <div class="dt-grid-2">
      <a-form-item :extra="t('dt.goodsLocationOfficeHint')">
        <template #label><DtGraphLabel graph="30" :text="t('dt.goodsLocationOffice')" /></template>
        <a-select
          :value="form.goodsLocationCustomsOfficeCode || undefined" :options="props.postOptions" :disabled="readonly"
          show-search allow-clear :filter-option="filterPost" :placeholder="officePlaceholder"
          :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '560px' }" style="width: 100%"
          @change="onOfficeChange"
        />
        <div v-if="officeChoices.length > 1 && !readonly" class="office-choices">
          <span class="office-choices-title">{{ t('dt.goodsLocationOfficeChoose') }}</span>
          <a-tag
            v-for="o in officeChoices" :key="o.customsOfficeCode" class="office-choice"
            :color="o.customsOfficeCode === form.goodsLocationCustomsOfficeCode ? 'blue' : undefined"
            :title="[o.ownerName, o.address].filter(Boolean).join(' · ')" @click="pickOffice(o.customsOfficeCode)"
          >{{ o.customsOfficeCode }}<template v-if="o.address"> · {{ o.address }}</template></a-tag>
        </div>
      </a-form-item>
    </div>

    <!-- Станция/адрес (гр.30) нужны для кода 52 (товары в транспортном средстве) и подобных мест.
         Показываем всегда как необязательные: лучше лишнее пустое поле, чем скрытая графа.
         ВАЖНО: «Станция» — это НАЗВАНИЕ станции/места (СТ.АКСЕНГЕР). Номера вагонов/ТС в КЕДЕН-XML
         берутся из гр.18 (arrivalTransportNumbers) и вводить их сюда не нужно. -->
    <div class="dt-grid-2">
      <a-form-item
        :extra="isOnTransport ? t('dt.stanciyaPodskazka52') : undefined"
        :validate-status="stationLooksLikeVehicleNumber ? 'warning' : undefined"
        :help="stationLooksLikeVehicleNumber ? t('dt.stanciyaNomerTs') : undefined"
      >
        <template #label><DtGraphLabel graph="30" :text="t('dt.stanciya')" /></template>
        <a-input v-uppercase v-model:value="form.goodsLocationStation" :disabled="readonly" :placeholder="t('dt.stanciya2')" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" :text="t('dt.adres')" /></template>
        <a-input v-uppercase v-model:value="form.goodsLocationAddress" :disabled="readonly" :placeholder="t('dt.adres2')" @change="emitChange" />
      </a-form-item>
    </div>

    <!-- Товар лежит на самом ТС (вагон/цистерна): одним действием ставим код 52. Номера ТС
         в XML берутся из гр.18 сами — раньше галочка копировала их в «Станцию», и номер вагона
         уезжал в название места. -->
    <div class="dt-grid-2">
      <a-form-item>
        <a-checkbox :checked="isOnTransport" :disabled="readonly" @change="onOnTransportChange"> {{ t('dt.tovarNaTransportnomSredstve') }} </a-checkbox>
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { referencesApi } from '@/api/references'
import { warehouseRegistryApi, warehouseValue, type WarehouseOfficeSuggestion, type WarehouseRegistryItem } from '@/api/warehouseRegistry'
import { checkWarehouseNumber } from '@/utils/warehouseNumber'
import type { Import40DtFormState } from '@/api/import40'
import { ALPHA2_COUNTRIES } from '@/types/api'
import './dt-sections.css'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  postOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()

// Страна места товаров (гр.30) — 2-буквенный код (в КЕДЕН уходит буквами).
const countryAlpha2Options = ALPHA2_COUNTRIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
const filterAlpha2 = (input: string, option: { value: string; label: string }) =>
  option.label.toLowerCase().includes(input.toLowerCase())
const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })

// Гр.29 — единый select по справочнику постов вместо двух свободных полей
// код/название. props.postOptions пришли из Import40DtView.vue уже в виде
// {value: код, label: полное имя} (тот же парсинг, что и для declarationNumber
// в DtDeclarationNumberBar.vue). Здесь value select'а — полное имя поста
// (form.borderCustomsOfficeName), а код при выборе распознаём тем же
// паттерном /^\d+/ из выбранной строки — так оба поля гр.29 проставляются
// одним действием пользователя.
//
// ВАЖНО: это должен быть computed(), а не обычная константа с .map(). Справочник
// постов (props.postOptions) в Import40DtView.vue грузится асинхронно и
// заполняется ПОСЛЕ монтирования DtSectionCustoms (компонент смонтирован сразу,
// v-show только скрывает секцию). Обычный `const ... = props.postOptions.map(...)`
// вычисляется один раз в момент выполнения <script setup> — на пустом ещё
// массиве — и застывает навсегда, поэтому выпадающий список гр.29 не открывал
// вариантов и не давал ничего выбрать. DtDeclarationNumberBar.vue не ловил эту
// проблему, т.к. использует `:options="props.postOptions"` прямо в шаблоне
// (реактивно, без промежуточной переменной).
const borderPostSelectOptions = computed(() => props.postOptions.map((o) => ({ value: o.label, label: o.label })))
const filterPost = (input: string, option: { label?: string }) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())
const onBorderPostChange = (value: string | undefined) => {
  form.borderCustomsOfficeCode = value ? (value.match(/^\d+/)?.[0] ?? value) : ''
  emitChange()
}

// Гр.30 — расширяемый справочник goods-locations. Код берём как есть из того,
// что пользователь ввёл в само поле (a-auto-complete уже хранит код в
// form.goodsLocationCode) — отдельного поля "код нового элемента" не заводим,
// чтобы не дублировать ввод. Название запрашиваем одним window.prompt —
// действие редкое (справочник пополняется, когда для места нет готового
// кода), полноценная модалка избыточна.
const addingGoodsLocation = ref(false)
const canAddGoodsLocation = computed(() => {
  const code = (form.goodsLocationCode ?? '').trim()
  if (!code) return false
  return !classifiers.options('goods-locations').some((o) => o.value === code)
})
const addGoodsLocation = async () => {
  const code = (form.goodsLocationCode ?? '').trim()
  if (!code) return
  const nameRu = window.prompt(t('dt.nazvanieDlyaKodaCode', { code }))
  if (!nameRu || !nameRu.trim()) return
  addingGoodsLocation.value = true
  try {
    await referencesApi.addGoodsLocation(code, nameRu.trim())
    classifiers.invalidate('goods-locations')
    await classifiers.load('goods-locations')
    form.goodsLocationCode = code
    emitChange()
    message.success(t('dt.dobavlenoVSpravochnikMesto'))
  } catch {
    message.error(t('dt.neUdalosSohranitV'))
  } finally {
    addingGoodsLocation.value = false
  }
}

// Гр.30 — реестры СВХ и таможенных складов КГД: автодополнение номера (номер · владелец · адрес).
// Значение опции — «reg:<id>» (у старых записей номер не уникален), в поле кладём номер при выборе.
const registryRows = ref<WarehouseRegistryItem[]>([])
let registryTimer: number | undefined
let registrySeq = 0
const registryOptions = computed(() => registryRows.value.map((r) => ({
  value: `reg:${r.id}`,
  number: warehouseValue(r),
  owner: r.ownerName,
  sub: r.address ?? '',
  kindLabel: r.kind === 'svh' ? t('dt.svhKind') : t('dt.tsKind'),
  suspended: r.isSuspended,
})))
const onRegistrySearch = (q: string) => {
  window.clearTimeout(registryTimer)
  const term = (q ?? '').trim()
  if (term.startsWith('reg:')) return // библиотека эхом присылает ключ выбранной опции
  if (term.length < 2) { registryRows.value = []; return }
  registryTimer = window.setTimeout(async () => {
    const seq = ++registrySeq
    try {
      const rows = await warehouseRegistryApi.search(term)
      if (seq === registrySeq) registryRows.value = rows
    } catch {
      if (seq === registrySeq) registryRows.value = [] // реестр — подсказка: без него остаётся ручной ввод
    }
  }, 300)
}
const onRegisterNumberInput = (v: string | undefined) => {
  if (typeof v === 'string' && v.startsWith('reg:')) return // выбор из списка обработает onRegistrySelect
  form.goodsLocationRegisterNumber = (v ?? '').toUpperCase()
  emitChange()
}
const onRegistrySelect = (key: string) => {
  const id = Number(String(key).replace('reg:', ''))
  const row = registryRows.value.find((r) => r.id === id)
  if (!row) return
  form.goodsLocationRegisterNumber = warehouseValue(row).toUpperCase()
  // Адрес подставляем только в пустое поле — введённое декларантом не затираем.
  if (!(form.goodsLocationAddress ?? '').trim() && row.address) form.goodsLocationAddress = row.address.toUpperCase()
  suggestOffice(row)
  emitChange()
}

// Орган места нахождения из НСИ КГД: однозначный — подставляем в пустое поле, несколько — варианты под полем.
const officeChoices = ref<WarehouseOfficeSuggestion[]>([])
const suggestOffice = (row: WarehouseRegistryItem) => {
  const offices = row.customsOffices ?? []
  officeChoices.value = offices.length > 1 ? offices : []
  if ((form.goodsLocationCustomsOfficeCode ?? '').trim()) return // выбранное вручную не затираем
  if (row.customsOfficeCode) {
    form.goodsLocationCustomsOfficeCode = row.customsOfficeCode
    message.info(t('dt.goodsLocationOfficeFromNsi', { code: row.customsOfficeCode }))
  }
}
const pickOffice = (code: string) => {
  form.goodsLocationCustomsOfficeCode = code
  emitChange()
}
const onOfficeChange = (value: string | undefined) => {
  form.goodsLocationCustomsOfficeCode = value ?? ''
  emitChange()
}
const officePlaceholder = computed(() => {
  const code = (props.modelValue.submissionCustomsOfficeCode ?? '').trim()
  return code ? t('dt.goodsLocationOfficeAsSubmission', { code }) : t('dt.goodsLocationOfficeAsSubmissionEmpty')
})
onBeforeUnmount(() => window.clearTimeout(registryTimer))

const numberHelp = computed(() => {
  switch (checkWarehouseNumber(form.goodsLocationRegisterNumber)) {
    case 'checksum': return t('dt.svhKontrolnyeCifry')
    case 'format': return t('dt.svhFormatNomera')
    case 'legacy': return t('dt.svhStaryyNomer')
    default: return null
  }
})

// Гр.30, код 52 — «товары в транспортном средстве»: номера ТС берутся из гр.18.
const isOnTransport = computed(() => (form.goodsLocationCode ?? '').trim() === '52')
const onOnTransportChange = (e: { target: { checked: boolean } }) => {
  form.goodsLocationCode = e.target.checked ? '52' : null
  emitChange()
}
// Старые данные: в «Станцию» вписан номер вагона/ТС (одни цифры) — как название места он не выгружается.
const stationLooksLikeVehicleNumber = computed(() => /^\d+$/.test((form.goodsLocationStation ?? '').trim()))
</script>

<style scoped>
.reg-opt { line-height: 1.35; white-space: normal; }
.reg-kind { color: var(--z-text-secondary, #8c8c8c); font-size: 12px; margin-left: 6px; }
.reg-sub { color: var(--z-text-secondary, #8c8c8c); font-size: 12px; }
.reg-tag { margin-left: 6px; }
.office-choices { margin-top: 6px; line-height: 1.9; }
.office-choices-title { color: var(--z-text-secondary, #8c8c8c); font-size: 12px; margin-right: 6px; }
.office-choice { cursor: pointer; }
</style>
