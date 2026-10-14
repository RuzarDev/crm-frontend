<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import TnvedPickerModal from '@/components/TnvedPickerModal.vue'
import { tnvedApi } from '@/api/tnved'
import { vUppercase } from '@/directives/uppercase'
import type { Import40GoodsItemInput } from '@/types/api'
import { useDtTnvedCheck } from '../tnvedCodeCheck'
import GoodsTroisHint from './GoodsTroisHint.vue'
import { okeiName } from './okei'
import { loadDei } from './tnvedDei'
import { DESCRIPTION_MAX_PARTS, DESCRIPTION_PART, splitDescription } from './descriptionParts'
import type { GoodsSectionProps } from './types'

// «Код и описание» (гр. 33, гр. 31): код ТН ВЭД (моно) с «Найти» (проверка узла: не лист — окно выбора) и «Справочник»
// (TnvedPickerModal, контракт прежний), проверка существования кода (общий кэш редактора — useTnvedCheck), описание из
// ТН ВЭД (только чтение), описание из инвойса (до 1000 знаков, счётчик и число частей по 250 для КЕДЕН) и бланк товара
// (марка, знак, модель — до 250, артикул — до 50, изготовитель) ЗАГЛАВНЫМИ,
// подсказка ТРОИС под маркой. ДЕИ (гр. 41) задаёт код ТН ВЭД — подставляется и снимается вместе с кодом.
// Правки — на месте; код — поле платежей (setField → «Пересчитать»); описание ТН ВЭД и ДЕИ по коду — производные.
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tc = (key: string) => t(`broker.dt.goods.editor.code.${key}`)
const check = useDtTnvedCheck()

type Goods = Import40GoodsItemInput
type StrKey = 'tnvedCode' | 'description' | 'tradeMarkName' | 'productMarkName' | 'productModelName' | 'productArticle' | 'manufacturerName'
const setStr = (key: StrKey, v: string) => { props.model.setField(props.item, key, (v || null) as Goods[StrKey]) }
// Код вставляют и с пробелами («4202 12 190 0») — храним без них.
const onCode = (v: string) => setStr('tnvedCode', v.replace(/\s+/g, ''))

const code = computed(() => (props.item.tnvedCode ?? '').trim())
const codeError = computed(() => (check.isInvalid(props.item.tnvedCode) ? tc('notFound') : undefined))
onMounted(() => { void check.validate(props.item.tnvedCode) })

// ДЕИ (гр. 41) задаёт код ТН ВЭД — тем же правилом, что сервер при сохранении: после «Найти», «Справочник» и ввода
// кода (пауза в наборе или уход из поля) — единица кода; у кода нет ДЕИ — единица снимается; код не найден или сбой —
// не трогается. ДЕИ влияет на платежи (количество в единице ставки): изменилась — товар получает «Пересчитать».
// Открытие товара ничего не меняет (только действие пользователя).
const compact = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, '')
async function applyDei(c: string) {
  const dei = await loadDei(c)
  const g = props.item
  if (dei === undefined || compact(g.tnvedCode) !== c) return
  const unitCode = dei?.code ?? null
  if ((g.unitCode || null) === unitCode) {
    if (dei && !g.unit) g.unit = dei.name || okeiName(dei.code) || null
    return
  }
  g.unitCode = unitCode
  g.unit = dei ? dei.name || okeiName(dei.code) || null : null
  props.model.markStale(g)
}
let deiTimer: ReturnType<typeof setTimeout> | undefined
const scheduleDei = (delay: number) => {
  clearTimeout(deiTimer)
  const c = compact(props.item.tnvedCode)
  if (!/^\d{10}$/.test(c)) return
  deiTimer = setTimeout(() => { void applyDei(c) }, delay)
}
onBeforeUnmount(() => clearTimeout(deiTimer))
const onCodeInput = (v: string) => {
  onCode(v)
  scheduleDei(600)
}
const onCodeBlur = () => {
  void check.validate(props.item.tnvedCode)
  scheduleDei(0)
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
  void applyDei(compact(payload.code))
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
    await applyDei(compact(c))
  } catch (e) {
    // Нет точного совпадения (частичный код) — справочник с поиском по нему.
    console.error('Failed to look up TNVED code', e)
    openPicker(c)
  } finally {
    finding.value = false
  }
}

// Пределы структуры ДТ (Решение Коллегии ЕЭК №75): описание — Text250, до 4 частей на товар (XML делит его сам);
// товарный знак, марка, модель — Name250; артикул — Id50. Изготовитель — Name300 (как было).
const DESCRIPTION_MAX = 1000
const NAME_MAX = 250
const ARTICLE_MAX = 50
const descriptionLength = computed(() => (props.item.description ?? '').trim().length)
/** Части по 250 знаков — тем же правилом, что сервер (по запятым и пробелам), а не n / 250. */
const descriptionPartCount = computed(() => splitDescription(props.item.description).length)
const descriptionTooManyParts = computed(() => descriptionPartCount.value > DESCRIPTION_MAX_PARTS)
/** Под описанием: счётчик и сколько частей по 250 знаков уйдёт в КЕДЕН. */
const descriptionHint = computed(() => {
  const n = descriptionLength.value
  if (descriptionTooManyParts.value) return undefined
  if (n <= DESCRIPTION_PART) return n ? t('broker.dt.goods.editor.code.descriptionCount', { n, max: DESCRIPTION_MAX }) : undefined
  return t('broker.dt.goods.editor.code.descriptionParts', { n, max: DESCRIPTION_MAX, parts: descriptionPartCount.value, part: DESCRIPTION_PART })
})
/** Больше 4 частей КЕДЕН не примет — предупреждение (выгрузку блокирует проверка готовности гр.31). */
const descriptionWarning = computed(() =>
  descriptionTooManyParts.value
    ? t('broker.dt.goods.editor.code.descriptionTooManyParts', {
        n: descriptionLength.value,
        max: DESCRIPTION_MAX,
        parts: descriptionPartCount.value,
        part: DESCRIPTION_PART,
        limit: DESCRIPTION_MAX_PARTS,
      })
    : undefined,
)

const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @4xl:grid-cols-4'
const sideBtn = 'shrink-0 max-sm:h-11'
</script>

<template>
  <div class="flex flex-col gap-4" data-goods-code-section>
    <ZField graph="33" :label="tc('code')" :error="codeError" data-graph="33" data-goods-field="tnvedCode" :data-goods-index="index">
      <div class="flex min-w-0 flex-wrap gap-1.5">
        <ZInput
          :value="item.tnvedCode"
          mono
          :maxlength="20"
          placeholder="0000000000"
          :disabled="readonly"
          class="min-w-[12rem] flex-1 max-sm:h-11"
          data-f="tnvedCode"
          @update:value="onCodeInput"
          @blur="onCodeBlur"
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

    <ZField graph="31" :label="tc('description')" :extra="descriptionHint" :help="descriptionWarning" :validate-status="descriptionWarning ? 'warning' : ''" data-graph="31" data-goods-field="description" :data-goods-index="index">
      <ZInput v-uppercase :value="item.description" :maxlength="DESCRIPTION_MAX" :disabled="readonly" :placeholder="tc('descriptionPlaceholder')" class="max-sm:h-11" data-f="description" @update:value="setStr('description', $event)" />
    </ZField>

    <div :class="grid">
      <div class="flex min-w-0 flex-col gap-1 @md:col-span-2 @4xl:col-span-4">
        <ZField graph="31" :label="tc('tradeMark')" data-graph="31" data-goods-field="tradeMarkName" :data-goods-index="index">
          <ZInput v-uppercase :value="item.tradeMarkName" :maxlength="NAME_MAX" :disabled="readonly" class="max-sm:h-11" data-f="tradeMarkName" @update:value="setStr('tradeMarkName', $event)" />
        </ZField>
        <GoodsTroisHint :name="item.tradeMarkName" />
      </div>
      <ZField graph="31" :label="tc('productMark')" data-graph="31" data-goods-field="productMarkName" :data-goods-index="index">
        <ZInput v-uppercase :value="item.productMarkName" :maxlength="NAME_MAX" :disabled="readonly" :placeholder="tc('notSet')" class="max-sm:h-11" data-f="productMarkName" @update:value="setStr('productMarkName', $event)" />
      </ZField>
      <ZField graph="31" :label="tc('model')" data-graph="31" data-goods-field="productModelName" :data-goods-index="index">
        <ZInput v-uppercase :value="item.productModelName" :maxlength="NAME_MAX" :disabled="readonly" :placeholder="tc('notSet')" class="max-sm:h-11" data-f="productModelName" @update:value="setStr('productModelName', $event)" />
      </ZField>
      <ZField graph="31" :label="tc('article')" data-graph="31" data-goods-field="productArticle" :data-goods-index="index">
        <ZInput v-uppercase :value="item.productArticle" :maxlength="ARTICLE_MAX" :disabled="readonly" :placeholder="tc('notSet')" class="max-sm:h-11" data-f="productArticle" @update:value="setStr('productArticle', $event)" />
      </ZField>
      <ZField graph="31" :label="tc('manufacturer')" data-graph="31" data-goods-field="manufacturerName" :data-goods-index="index">
        <ZInput v-uppercase :value="item.manufacturerName" :maxlength="300" :disabled="readonly" class="max-sm:h-11" data-f="manufacturerName" @update:value="setStr('manufacturerName', $event)" />
      </ZField>
    </div>

    <TnvedPickerModal v-if="pickerUsed" v-model:open="pickerOpen" :initial-query="pickerQuery" @select="onPickerSelect" />
  </div>
</template>
