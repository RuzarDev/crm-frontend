<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import TnvedPickerModal from '@/components/TnvedPickerModal.vue'
import { tnvedApi } from '@/api/tnved'
import type { ReestrGoodsItemInput } from '@/types/api'
import { OKEI_QUANTITY_TYPE_CODES } from '@/types/api'
import { formatTnved } from '@/utils/tnvedFormat'
import { formatKg, formatQty, formatValue, useTnvedCheck } from './goods'
import { useLocalOptions } from './localOptions'
import { useRecordRefs } from './refs'
import { boxCtl, ctl, str } from './ui'

// Карточка товара раздела «Товары» (доска TransitRecord, разбор §2.4). Поля пишут прямо в товар черновика.
// Заголовок — номер, код ТН ВЭД с пробелами, описание; свёрнутая — сводка «120 шт · 96,0 кг · 1 800 USD».
// Проверка кода — общий кэш раздела (useTnvedCheck), в товар ничего служебного не кладётся (B.13).
const props = defineProps<{ item: ReestrGoodsItemInput; index: number; readonly: boolean; expanded: boolean }>()
const emit = defineEmits<{ toggle: []; remove: [] }>()
const { t, locale } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.transitRecord.goods.${key}`, p ?? {})

// Справочники — общий загрузчик страницы (один запрос на справочник, сколько бы ни было карточек).
const refs = useRecordRefs()
void refs.ensure('countries', 'okei')
const check = useTnvedCheck()
const { currencies } = useLocalOptions()
const quantityTypeOptions = OKEI_QUANTITY_TYPE_CODES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))

const bodyId = `goods-card-${useId()}`
const n = computed(() => props.index + 1)

function set<K extends keyof ReestrGoodsItemInput>(key: K, value: ReestrGoodsItemInput[K]) {
  props.item[key] = value
}
type StrKey = { [K in keyof ReestrGoodsItemInput]: ReestrGoodsItemInput[K] extends string | null ? K : never }[keyof ReestrGoodsItemInput]
const setStr = (key: StrKey, v: unknown) => set(key, str(v))

// ── Заголовок ────────────────────────────────────────────────────────────────
const code = computed(() => (props.item.tnvedCode ?? '').trim())
const title = computed(() => props.item.description || props.item.tnvedDescription || '')
const unitName = computed(() => refs.okeiName(props.item.unitCode) ?? props.item.unit ?? '')
const summary = computed(() => {
  const g = props.item
  const parts: string[] = []
  if (g.quantity != null) parts.push(`${formatQty(g.quantity, locale.value)} ${unitName.value}`.trim())
  if (g.grossWeightKg != null) parts.push(`${formatKg(g.grossWeightKg, locale.value)} ${tr('kg')}`)
  if (g.customsValue != null) parts.push(`${formatValue(g.customsValue, locale.value)} ${g.currency ?? ''}`.trim())
  return parts.join(' · ')
})
const valueLabel = computed(() => (props.item.currency ? tr('valueIn', { currency: props.item.currency }) : tr('value')))

// ── ТН ВЭД: проверка, «Найти», «Справочник» (те же вызовы, что в редакторе товара ДТ) ──────────────────
const codeError = computed(() => (check.isInvalid(props.item.tnvedCode) ? t('dt.kodaNetVSpravochnikeTnved') : undefined))
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
  set('tnvedCode', payload.code)
  check.markValid(payload.code)
  if (!props.item.tnvedDescription) set('tnvedDescription', payload.name)
}

async function lookup() {
  const c = code.value
  if (!c) return
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
    set('tnvedDescription', res.data.name)
    // Единица — по ставкам ТН ВЭД, только если её ещё нет.
    if (!props.item.unitCode && !props.item.unit) {
      try {
        const rates = await tnvedApi.rates(c)
        if (rates.data.unitCode) {
          set('unitCode', rates.data.unitCode)
          set('unit', rates.data.unitName || refs.okeiName(rates.data.unitCode) || props.item.unit)
        }
      } catch (e) {
        console.error('Failed to look up TNVED unit', e)
      }
    }
  } catch (e) {
    // Нет точного совпадения (частичный код) — справочник с поиском по нему.
    console.error('Failed to look up TNVED code', e)
    openPicker(c)
  } finally {
    finding.value = false
  }
}

const codeInput = ref<{ focus: () => void } | null>(null)
defineExpose({ focusCode: () => codeInput.value?.focus() })

// ── Только чтение: значения текстом ──────────────────────────────────────────
const optionLabel = (options: { value: unknown; label: string }[], v: string | null) =>
  v ? options.find((o) => o.value === v)?.label ?? v : ''
const readRows = computed(() => {
  const g = props.item
  const unit = g.unitCode ? optionLabel(refs.okeiOptions.value, g.unitCode) : g.unit ?? ''
  return [
    [
      { label: tr('quantity'), value: g.quantity != null ? formatQty(g.quantity, locale.value) : '' },
      { label: tr('unit'), value: unit },
      { label: t('dt.bruttoKg'), value: g.grossWeightKg != null ? formatKg(g.grossWeightKg, locale.value) : '' },
      { label: t('dt.nettoKg'), value: g.netWeightKg != null ? formatKg(g.netWeightKg, locale.value) : '' },
      { label: tr('places'), value: g.packagesCount != null ? formatQty(g.packagesCount, locale.value) : '' },
      { label: valueLabel.value, value: g.customsValue != null ? formatValue(g.customsValue, locale.value) : '' },
    ],
    [
      { label: t('dt.kodTnved'), value: g.tnvedCode ? formatTnved(g.tnvedCode) : '', mono: true },
      { label: t('dt.opisanieTovaraIzTnved'), value: g.tnvedDescription ?? '' },
      { label: t('dt.opisanieIzInvoysa'), value: g.description ?? '' },
    ],
    [
      { label: t('dt.stranaProishozhdeniya'), value: optionLabel(refs.countryOptions.value, g.countryOfOrigin) },
      { label: t('dt.kodTipaKolVa'), value: optionLabel(quantityTypeOptions, g.quantityTypeCode) },
      { label: t('dt.valyuta'), value: g.currency ?? '' },
    ],
  ] as { label: string; value: string; mono?: boolean }[][]
})

// Ряды полей: 6 колонок (телефон — две), код с кнопками шире описаний, страна/тип/валюта — три.
const row1 = 'grid grid-cols-2 gap-3 sm:grid-cols-3 @2xl:grid-cols-6'
const row2 = 'grid grid-cols-1 gap-3 sm:grid-cols-2 @2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]'
const row3 = 'grid grid-cols-1 gap-3 sm:grid-cols-3'
// Колонки — по ширине карточки (@container), не окна: карточка живёт и на всю страницу записи (4б),
// и в половине экрана рядом с документом (редактор партии, 4в).
const readRowClass = [row1, row2, row3]
const badge = 'inline-flex size-[22px] shrink-0 items-center justify-center rounded-field bg-surface text-xs font-semibold text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
const iconBtn = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
const sideBtn = 'shrink-0 border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11'
</script>

<template>
  <article class="min-w-0 rounded-row border border-line bg-surface" data-goods-card>
    <header
      class="flex items-center gap-2 bg-canvas py-1.5 pr-2 pl-3.5"
      :class="expanded ? 'rounded-t-row border-b border-line' : 'rounded-row'"
    >
      <button
        type="button"
        class="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-field border-0 bg-transparent p-0 py-1 text-left font-sans text-sm text-ink outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
        :aria-expanded="expanded ? 'true' : 'false'"
        :aria-controls="bodyId"
        data-goods-toggle
        @click="emit('toggle')"
      >
        <span :class="badge" data-goods-number>{{ n }}</span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
          <span class="flex min-w-0 items-center gap-2.5">
            <span class="shrink-0 font-mono font-medium" :class="code ? 'text-ink' : 'text-muted'" data-goods-code>{{ code ? formatTnved(code) : tr('noCode') }}</span>
            <span class="min-w-0 truncate text-[13.5px] text-ink-2" data-goods-title>{{ title }}</span>
          </span>
          <span v-if="!expanded && summary" class="text-[12.5px] text-muted tabular-nums sm:ml-auto sm:shrink-0" data-goods-summary>{{ summary }}</span>
        </span>
        <PhCaretDown
          :size="16"
          aria-hidden="true"
          class="shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none"
          :class="expanded && 'rotate-180'"
        />
      </button>
      <button
        v-if="!readonly"
        type="button"
        :class="iconBtn"
        :aria-label="tr('deleteLabel', { n })"
        data-goods-delete
        @click="emit('remove')"
      ><PhX :size="16" aria-hidden="true" /></button>
    </header>

    <div v-if="expanded" :id="bodyId" class="@container flex flex-col gap-3 p-3.5" data-goods-body>
      <template v-if="readonly">
        <dl v-for="(row, i) in readRows" :key="i" :class="['m-0', readRowClass[i]]">
          <div v-for="cell in row" :key="cell.label" class="flex min-w-0 flex-col gap-1">
            <dt class="text-xs leading-4 text-ink-3">{{ cell.label }}</dt>
            <dd class="m-0 min-h-5 text-sm break-words text-ink" :class="cell.mono && 'font-mono'">{{ cell.value || '—' }}</dd>
          </div>
        </dl>
      </template>

      <template v-else>
        <div :class="row1">
          <ZField :label="tr('quantity')">
            <ZNumber :value="item.quantity" :min="0" :class="ctl" data-f="quantity" @update:value="set('quantity', $event)" />
          </ZField>
          <ZField :label="tr('unit')" :title="t('dt.poKoduTnved')">
            <ZSelect :value="item.unitCode" :options="refs.okeiOptions.value" :disabled="true" :placeholder="item.unit || t('dt.avto')" :class="boxCtl" data-f="unitCode" />
          </ZField>
          <ZField :label="t('dt.bruttoKg')">
            <ZNumber :value="item.grossWeightKg" :min="0" :class="ctl" data-f="grossWeightKg" @update:value="set('grossWeightKg', $event)" />
          </ZField>
          <ZField :label="t('dt.nettoKg')">
            <ZNumber :value="item.netWeightKg" :min="0" :class="ctl" data-f="netWeightKg" @update:value="set('netWeightKg', $event)" />
          </ZField>
          <ZField :label="tr('places')">
            <ZNumber :value="item.packagesCount" :min="0" :class="ctl" data-f="packagesCount" @update:value="set('packagesCount', $event)" />
          </ZField>
          <ZField :label="valueLabel">
            <ZNumber :value="item.customsValue" :min="0" :class="ctl" data-f="customsValue" @update:value="set('customsValue', $event)" />
          </ZField>
        </div>

        <div :class="row2">
          <ZField :label="t('dt.kodTnved')" :error="codeError" class="sm:col-span-2 @2xl:col-span-1">
            <div class="flex min-w-0 gap-1.5 max-sm:flex-wrap">
              <ZInput
                ref="codeInput"
                :value="item.tnvedCode"
                mono
                :maxlength="64"
                placeholder="0000000000"
                :class="[ctl, 'min-w-0 flex-1 max-sm:basis-full']"
                data-f="tnvedCode"
                @update:value="setStr('tnvedCode', $event)"
                @blur="check.validate(item.tnvedCode)"
              />
              <ZButton :class="[sideBtn, 'max-sm:flex-1']" :loading="finding" data-goods-find @click="lookup">{{ t('dt.nayti') }}</ZButton>
              <ZButton :class="[sideBtn, 'max-sm:flex-1']" data-goods-picker @click="openPicker(code)">{{ t('dt.spravochnik') }}</ZButton>
            </div>
          </ZField>
          <ZField :label="t('dt.opisanieTovaraIzTnved')">
            <ZInput :value="item.tnvedDescription" :maxlength="1000" :placeholder="t('dt.avtozapolneniePoKoduTnved')" :class="ctl" data-f="tnvedDescription" @update:value="setStr('tnvedDescription', $event)" />
          </ZField>
          <ZField :label="t('dt.opisanieIzInvoysa')">
            <ZInput :value="item.description" :maxlength="1000" :placeholder="t('dt.opisanieTovaraIzInvoysa')" :class="ctl" data-f="description" @update:value="setStr('description', $event)" />
          </ZField>
        </div>

        <div :class="row3">
          <ZField :label="t('dt.stranaProishozhdeniya')">
            <ZSelect :value="item.countryOfOrigin" :options="refs.countryOptions.value" show-search allow-clear :placeholder="t('dt.vyberiteStranuPoKodu')" :class="boxCtl" data-f="countryOfOrigin" @update:value="setStr('countryOfOrigin', $event)" />
          </ZField>
          <ZField :label="t('dt.kodTipaKolVa')">
            <ZSelect :value="item.quantityTypeCode" :options="quantityTypeOptions" show-search allow-clear :placeholder="t('dt.rkRr')" :popup-width="320" :class="boxCtl" data-f="quantityTypeCode" @update:value="setStr('quantityTypeCode', $event)" />
          </ZField>
          <ZField :label="t('dt.valyuta')">
            <ZSelect :value="item.currency" :options="currencies" show-search allow-clear placeholder="USD" :class="boxCtl" data-f="currency" @update:value="setStr('currency', $event)" />
          </ZField>
        </div>
      </template>
    </div>

    <TnvedPickerModal v-if="pickerUsed" v-model:open="pickerOpen" :initial-query="pickerQuery" @select="onPickerSelect" />
  </article>
</template>
