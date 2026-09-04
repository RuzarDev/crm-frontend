<template>
  <div class="dt-section">
    <div class="dt-grid-2">
      <a-form-item>
        <template #label><DtGraphLabel graph="29" text="Пост на границе" /></template>
        <a-select
          v-model:value="form.borderCustomsOfficeName" :options="borderPostSelectOptions" :disabled="readonly"
          show-search allow-clear :filter-option="filterPost" placeholder="код или название поста" style="width: 100%"
          @change="onBorderPostChange"
        />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Место нахождения товаров" /></template>
        <a-input-group compact style="display: flex">
          <a-auto-complete
            v-model:value="form.goodsLocationCode" :options="classifiers.options('goods-locations')"
            :disabled="readonly" placeholder="11" style="flex: 1" @change="emitChange"
          />
          <a-button
            v-if="!readonly && canAddGoodsLocation" :loading="addingGoodsLocation" title="Сохранить в справочник"
            @click="addGoodsLocation"
          >
            + Сохранить в справочник
          </a-button>
        </a-input-group>
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Номер СВХ" /></template>
        <a-input v-uppercase v-model:value="form.goodsLocationRegisterNumber" :disabled="readonly" placeholder="Рег. номер СВХ" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Страна места товаров" /></template>
        <a-select v-model:value="form.goodsLocationCountryCode" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <!-- Станция/адрес (гр.30) относятся к месту нахождения на транспорте/станции (код 52 и
         подобные), но точный набор триггер-кодов в справочнике goods-locations не размечен
         отдельным признаком "транспорт". Показываем поля всегда как необязательные —
         декларант заполняет их только когда это применимо к выбранному месту, лучше лишнее
         пустое поле, чем скрытая графа, которая понадобится. -->
    <div class="dt-grid-2">
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Станция" /></template>
        <a-input v-uppercase v-model:value="form.goodsLocationStation" :disabled="readonly" placeholder="станция" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Адрес" /></template>
        <a-input v-uppercase v-model:value="form.goodsLocationAddress" :disabled="readonly" placeholder="адрес" @change="emitChange" />
      </a-form-item>
    </div>

    <!-- Товар лежит на самом ТС (напр. вагон/цистерна) — переносим номера ТС из гр.18
         (form.arrivalTransportNumbers) в гр.30 "Станция" одним действием, без ручного
         перепечатывания. Пишем именно в goodsLocationStation, а не Address — поле
         подписано "Станция" и по смыслу гр.30 ближе всего к транспортному признаку места. -->
    <div class="dt-grid-2">
      <a-form-item>
        <a-checkbox v-model:checked="transferVehicleNumbers" :disabled="readonly" @change="onTransferVehicleNumbersChange">
          Товар на транспортном средстве — перенести номера ТС (гр.18) в гр.30
        </a-checkbox>
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { referencesApi } from '@/api/references'
import type { Import40DtFormState } from '@/api/import40'
import { ALPHA2_COUNTRIES } from '@/types/api'
import './dt-sections.css'

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
const borderPostSelectOptions = props.postOptions.map((o) => ({ value: o.label, label: o.label }))
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
  const nameRu = window.prompt(`Название для кода "${code}" в справочнике "Место нахождения товаров" (гр.30):`)
  if (!nameRu || !nameRu.trim()) return
  addingGoodsLocation.value = true
  try {
    await referencesApi.addGoodsLocation(code, nameRu.trim())
    classifiers.invalidate('goods-locations')
    await classifiers.load('goods-locations')
    form.goodsLocationCode = code
    emitChange()
    message.success('Добавлено в справочник «Место нахождения товаров»')
  } catch {
    message.error('Не удалось сохранить в справочник')
  } finally {
    addingGoodsLocation.value = false
  }
}

// Товар лежит на самом ТС (вагон/цистерна и т.п.) — переносим номера ТС из
// гр.18 (form.arrivalTransportNumbers, приходят вместе с остальным dtForm
// через props.modelValue) в гр.30 "Станция" одним действием.
const transferVehicleNumbers = ref(false)
const onTransferVehicleNumbersChange = () => {
  if (!transferVehicleNumbers.value) return
  const numbers = (props.modelValue.arrivalTransportNumbers ?? [])
    .map((m) => m.number?.trim())
    .filter((n): n is string => !!n)
  form.goodsLocationStation = numbers.join(', ')
  emitChange()
}
</script>
