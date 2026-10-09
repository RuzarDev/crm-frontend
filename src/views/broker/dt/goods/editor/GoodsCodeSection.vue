<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import TnvedPickerModal from '@/components/TnvedPickerModal.vue'
import { tnvedApi } from '@/api/tnved'
import { vUppercase } from '@/directives/uppercase'
import type { Import40GoodsItemInput } from '@/types/api'
import { useTnvedCheck } from '@/views/broker/transit/record/sections/goods'
import GoodsTroisHint from './GoodsTroisHint.vue'
import { okeiName } from './okei'
import type { GoodsSectionProps } from './types'

// «Код и описание» (гр. 33, гр. 31): код ТН ВЭД (моно) с «Найти» (проверка узла: не лист — окно выбора) и «Справочник»
// (TnvedPickerModal, контракт прежний), проверка существования кода (общий кэш редактора — useTnvedCheck), описание из
// ТН ВЭД (только чтение), описание из инвойса и бланк товара (марка, знак, модель, артикул, изготовитель) ЗАГЛАВНЫМИ,
// подсказка ТРОИС под маркой. ДЕИ подставляется по коду, только когда пуст (ставки ТН ВЭД).
// Правки — на месте; код — поле платежей (setField → «Пересчитать»); описание ТН ВЭД и ДЕИ по коду — производные.
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tc = (key: string) => t(`broker.dt.goods.editor.code.${key}`)
const check = useTnvedCheck()

type Goods = Import40GoodsItemInput
type StrKey = 'tnvedCode' | 'description' | 'tradeMarkName' | 'productMarkName' | 'productModelName' | 'productArticle' | 'manufacturerName'
const setStr = (key: StrKey, v: string) => { props.model.setField(props.item, key, (v || null) as Goods[StrKey]) }
// Код вставляют и с пробелами («4202 12 190 0») — храним без них.
const onCode = (v: string) => setStr('tnvedCode', v.replace(/\s+/g, ''))

const code = computed(() => (props.item.tnvedCode ?? '').trim())
const codeError = computed(() => (check.isInvalid(props.item.tnvedCode) ? tc('notFound') : undefined))
onMounted(() => { void check.validate(props.item.tnvedCode) })

// ДЕИ по коду ТН ВЭД — только если единицы ещё нет (как прежняя карточка). Производное: без «Пересчитать» (код уже пометил).
async function fillUnit(c: string) {
  const g = props.item
  if (g.unitCode || g.unit) return
  try {
    const rates = await tnvedApi.rates(c, { silent: true })
    if (rates.data.unitCode && !g.unitCode && !g.unit) {
      g.unitCode = rates.data.unitCode
      g.unit = rates.data.unitName || okeiName(rates.data.unitCode) || null
    }
  } catch (e) {
    console.error('Failed to look up TNVED unit', e)
  }
}

const finding = ref(false)
const pickerUsed = ref(false)
const pickerOpen = ref(false)
const pickerQuery = ref('')
const openPicker = (query: string) => {
  pickerQuery.value = query
  pickerUsed.value = true
  pickerOpen.value = true
}
const onPickerSelect = (payload: { code: string; name: string }) => {
  props.model.setField(props.item, 'tnvedCode', payload.code)
  check.markValid(payload.code)
  if (!props.item.tnvedDescription) props.item.tnvedDescription = payload.name
  void fillUnit(payload.code)
}

async function lookup() {
  const c = code.value
  if (!c || props.readonly) return
  finding.value = true
  try {
    // Тихо: не нашёлся — открывается справочник с этим кодом, тост сервера не нужен.
    const res = await tnvedApi.node(c, { silent: true })
    // Неполный код (напр. 6 знаков) — не лист: справочник с этим кодом, чтобы выбрать 10-значный.
    if (!res.data.is10) {
      openPicker(c)
      return
    }
    check.markValid(c)
    props.item.tnvedDescription = res.data.name
    await fillUnit(c)
  } catch (e) {
    // Нет точного совпадения (частичный код) — справочник с поиском по нему.
    console.error('Failed to look up TNVED code', e)
    openPicker(c)
  } finally {
    finding.value = false
  }
}

const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @xl:grid-cols-4'
const sideBtn = 'shrink-0 max-sm:h-11'
</script>

<template>
  <div class="flex flex-col gap-4" data-goods-code-section>
    <ZField graph="33" :label="tc('code')" :error="codeError" data-graph="33" :data-goods-index="index">
      <div class="flex min-w-0 flex-wrap gap-1.5">
        <ZInput
          :value="item.tnvedCode"
          mono
          :maxlength="20"
          placeholder="0000000000"
          :disabled="readonly"
          class="min-w-[12rem] flex-1 max-sm:h-11"
          data-f="tnvedCode"
          @update:value="onCode"
          @blur="check.validate(item.tnvedCode)"
          @press-enter="lookup"
        />
        <template v-if="!readonly">
          <ZButton :class="sideBtn" :loading="finding" data-goods-find @click="lookup">{{ tc('find') }}</ZButton>
          <ZButton :class="sideBtn" data-goods-picker @click="openPicker(code)">{{ tc('picker') }}</ZButton>
        </template>
      </div>
    </ZField>

    <div class="flex min-w-0 flex-col gap-1" data-goods-tnved-description>
      <span class="text-sm font-medium text-ink-2">{{ tc('tnvedDescription') }}</span>
      <p class="m-0 rounded-field bg-sunken px-3 py-2 text-sm break-words" :class="item.tnvedDescription ? 'text-ink' : 'text-muted'">
        {{ item.tnvedDescription || tc('tnvedDescriptionEmpty') }}
      </p>
    </div>

    <ZField graph="31" :label="tc('description')" data-graph="31" :data-goods-index="index">
      <ZInput v-uppercase :value="item.description" :maxlength="1000" :disabled="readonly" :placeholder="tc('descriptionPlaceholder')" class="max-sm:h-11" data-f="description" @update:value="setStr('description', $event)" />
    </ZField>

    <div :class="grid">
      <div class="flex min-w-0 flex-col gap-1 @md:col-span-2 @xl:col-span-4">
        <ZField graph="31" :label="tc('tradeMark')" data-graph="31" :data-goods-index="index">
          <ZInput v-uppercase :value="item.tradeMarkName" :maxlength="300" :disabled="readonly" class="max-sm:h-11" data-f="tradeMarkName" @update:value="setStr('tradeMarkName', $event)" />
        </ZField>
        <GoodsTroisHint :name="item.tradeMarkName" />
      </div>
      <ZField graph="31" :label="tc('productMark')" data-graph="31" :data-goods-index="index">
        <ZInput v-uppercase :value="item.productMarkName" :maxlength="300" :disabled="readonly" :placeholder="tc('notSet')" class="max-sm:h-11" data-f="productMarkName" @update:value="setStr('productMarkName', $event)" />
      </ZField>
      <ZField graph="31" :label="tc('model')" data-graph="31" :data-goods-index="index">
        <ZInput v-uppercase :value="item.productModelName" :maxlength="300" :disabled="readonly" :placeholder="tc('notSet')" class="max-sm:h-11" data-f="productModelName" @update:value="setStr('productModelName', $event)" />
      </ZField>
      <ZField graph="31" :label="tc('article')" data-graph="31" :data-goods-index="index">
        <ZInput v-uppercase :value="item.productArticle" :maxlength="300" :disabled="readonly" :placeholder="tc('notSet')" class="max-sm:h-11" data-f="productArticle" @update:value="setStr('productArticle', $event)" />
      </ZField>
      <ZField graph="31" :label="tc('manufacturer')" data-graph="31" :data-goods-index="index">
        <ZInput v-uppercase :value="item.manufacturerName" :maxlength="300" :disabled="readonly" class="max-sm:h-11" data-f="manufacturerName" @update:value="setStr('manufacturerName', $event)" />
      </ZField>
    </div>

    <TnvedPickerModal v-if="pickerUsed" v-model:open="pickerOpen" :initial-query="pickerQuery" @select="onPickerSelect" />
  </div>
</template>
