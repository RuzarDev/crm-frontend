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
      <a-form-item>
        <template #label><DtGraphLabel graph="30" :text="t('dt.nomerSvh')" /></template>
        <a-input v-uppercase v-model:value="form.goodsLocationRegisterNumber" :disabled="readonly" :placeholder="t('dt.regNomerSvh')" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" :text="t('dt.stranaMestaTovarov')" /></template>
        <a-select v-model:value="form.goodsLocationCountryCode" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="width: 100%" @change="emitChange" />
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
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { referencesApi } from '@/api/references'
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

// Гр.30, код 52 — «товары в транспортном средстве»: номера ТС берутся из гр.18.
const isOnTransport = computed(() => (form.goodsLocationCode ?? '').trim() === '52')
const onOnTransportChange = (e: { target: { checked: boolean } }) => {
  form.goodsLocationCode = e.target.checked ? '52' : null
  emitChange()
}
// Старые данные: в «Станцию» вписан номер вагона/ТС (одни цифры) — как название места он не выгружается.
const stationLooksLikeVehicleNumber = computed(() => /^\d+$/.test((form.goodsLocationStation ?? '').trim()))
</script>
