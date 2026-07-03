<template>
  <div class="goods-section">
    <div class="section-bar">
      <span class="section-label">ТОВАРЫ</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">+ Добавить товар</a-button>
    </div>

    <div v-if="items.length === 0" class="empty-state">
      <span v-if="!readonly">Нажмите «+ Добавить товар» чтобы добавить позицию</span>
      <span v-else>Нет товаров</span>
    </div>

    <div v-for="(item, idx) in items" :key="idx" class="goods-card">
      <div class="card-top">
        <span class="card-num" title="Порядковый номер товара">{{ idx + 1 }}</span>
        <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)">✕</a-button>
      </div>

      <!-- Row: код тнвэд + найти + описание из тнвэд -->
      <div class="field-row">
        <div class="field f-2">
          <div class="field-label">Код ТНВЭД</div>
          <a-input-group compact style="display: flex">
            <a-input
              v-model:value="item.tnvedCode"
              size="small"
              :disabled="readonly"
              placeholder="0000000000"
              @change="emit('update:modelValue', items.map(fromRow))"
            />
            <a-button
              v-if="!readonly"
              size="small"
              :loading="item.tnvedLoading"
              @click="lookupTnved(item)"
            >Найти</a-button>
          </a-input-group>
        </div>
        <div class="field f-2">
          <div class="field-label">Описание товара из ТНВЭД</div>
          <a-input
            v-model:value="item.tnvedDescription"
            size="small"
            :disabled="readonly"
            placeholder="Автозаполнение по коду ТНВЭД"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: описание из инвойса (wide) -->
      <div class="field-row">
        <div class="field f-grow">
          <div class="field-label">Описание из инвойса</div>
          <a-input
            v-model:value="item.description"
            size="small"
            :disabled="readonly"
            placeholder="Описание товара из инвойса"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: страна происхождения -->
      <div class="field-row">
        <div class="field f-2">
          <div class="field-label">Страна происхождения</div>
          <a-select
            v-model:value="item.countryOfOrigin"
            size="small"
            :disabled="readonly"
            show-search
            allow-clear
            style="width: 100%"
            :options="countryOptions"
            :filter-option="filterCountry"
            placeholder="Выберите страну по коду"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: кол-во + код ОКЕИ + тип количества -->
      <div class="field-row">
        <div class="field f-narrow">
          <div class="field-label">Кол-во</div>
          <a-input
            v-model:value="item.quantityStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'quantity', item.quantityStr)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Код ДЕИ (ОКЕИ)</div>
          <a-select
            v-model:value="item.unitCode"
            size="small"
            :disabled="readonly"
            show-search
            allow-clear
            style="width: 100%"
            :options="okeiOptions"
            placeholder="796"
            @change="(v: string) => onUnitCodeChange(item, v)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Код типа кол-ва</div>
          <a-select
            v-model:value="item.quantityTypeCode"
            size="small"
            :disabled="readonly"
            allow-clear
            style="width: 100%"
            :options="quantityTypeOptions"
            placeholder="РК / РР"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: брутто + нетто + кол-во мест -->
      <div class="field-row">
        <div class="field f-narrow">
          <div class="field-label">Брутто, кг</div>
          <a-input
            v-model:value="item.grossWeightStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'grossWeightKg', item.grossWeightStr)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Нетто, кг</div>
          <a-input
            v-model:value="item.netWeightStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'netWeightKg', item.netWeightStr)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Кол-во грузовых мест</div>
          <a-input
            v-model:value="item.packagesCountStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'packagesCount', item.packagesCountStr)"
          />
        </div>
      </div>

      <!-- Row: там.стоимость + валюта -->
      <div class="field-row">
        <div class="field f-2">
          <div class="field-label">Таможенная стоимость</div>
          <a-input
            v-model:value="item.customsValueStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'customsValue', item.customsValueStr)"
          />
        </div>
        <div class="field f-2">
          <div class="field-label">Валюта</div>
          <a-select
            v-model:value="item.currency"
            size="small"
            :disabled="readonly"
            show-search
            allow-clear
            style="width: 100%"
            :options="currencyOptions"
            :filter-option="filterCurrency"
            placeholder="USD"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { tnvedApi } from '@/api/tnved'
import { referencesApi } from '@/api/references'
import type { ReestrGoodsItemInput } from '@/types/api'
import { OKEI_QUANTITY_TYPE_CODES } from '@/types/api'

interface GoodsRow extends ReestrGoodsItemInput {
  quantityStr: string
  grossWeightStr: string
  netWeightStr: string
  packagesCountStr: string
  customsValueStr: string
  tnvedLoading?: boolean
}

const props = defineProps<{
  modelValue: ReestrGoodsItemInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrGoodsItemInput[]): void
}>()

const quantityTypeOptions = OKEI_QUANTITY_TYPE_CODES.map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name}`,
}))

const okeiOptions = ref<{ value: string; label: string }[]>([])
const okeiByCode = ref<Record<string, string>>({})
const countryOptions = ref<{ value: string; label: string }[]>([])

onMounted(async () => {
  try {
    const units = await referencesApi.listOkeiUnits()
    okeiOptions.value = units.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }))
    okeiByCode.value = Object.fromEntries(units.map((u) => [u.code, u.name]))
  } catch (e) {
    console.error('Failed to load OKEI units', e)
  }
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch (e) {
    console.error('Failed to load countries', e)
  }
})

function filterCountry(input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

function onUnitCodeChange(item: GoodsRow, code: string | undefined) {
  item.unitCode = code || null
  if (code && okeiByCode.value[code]) {
    item.unit = okeiByCode.value[code]
  }
  emit('update:modelValue', items.value.map(fromRow))
}

async function lookupTnved(item: GoodsRow) {
  const code = (item.tnvedCode || '').trim()
  if (!code) return
  item.tnvedLoading = true
  try {
    const res = await tnvedApi.node(code)
    item.tnvedDescription = res.data.name
    emit('update:modelValue', items.value.map(fromRow))
  } catch (e) {
    console.error('Failed to look up TNVED code', e)
  } finally {
    item.tnvedLoading = false
  }
}

const CURRENCIES = [
  { value: 'USD', label: 'USD — Доллар США' },
  { value: 'EUR', label: 'EUR — Евро' },
  { value: 'CNY', label: 'CNY — Юань' },
  { value: 'KZT', label: 'KZT — Тенге' },
  { value: 'RUB', label: 'RUB — Рубль' },
  { value: 'GBP', label: 'GBP — Фунт стерлингов' },
  { value: 'CHF', label: 'CHF — Швейцарский франк' },
  { value: 'JPY', label: 'JPY — Иена' },
  { value: 'AED', label: 'AED — Дирхам ОАЭ' },
  { value: 'TRY', label: 'TRY — Турецкая лира' },
]
const currencyOptions = CURRENCIES

function filterCurrency(_input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(_input.toLowerCase())
}

const items = ref<GoodsRow[]>([])

function toRow(g: ReestrGoodsItemInput): GoodsRow {
  return {
    ...g,
    quantityStr: g.quantity != null ? String(g.quantity) : '',
    grossWeightStr: g.grossWeightKg != null ? String(g.grossWeightKg) : '',
    netWeightStr: g.netWeightKg != null ? String(g.netWeightKg) : '',
    packagesCountStr: g.packagesCount != null ? String(g.packagesCount) : '',
    customsValueStr: g.customsValue != null ? String(g.customsValue) : '',
  }
}

function fromRow(r: GoodsRow): ReestrGoodsItemInput {
  return {
    description: r.description || null,
    tnvedCode: r.tnvedCode || null,
    tnvedDescription: r.tnvedDescription || null,
    countryOfOrigin: r.countryOfOrigin || null,
    quantity: r.quantity,
    unit: r.unit || null,
    unitCode: r.unitCode || null,
    grossWeightKg: r.grossWeightKg,
    netWeightKg: r.netWeightKg,
    packagesCount: r.packagesCount,
    quantityTypeCode: r.quantityTypeCode || null,
    customsValue: r.customsValue,
    currency: r.currency || null,
  }
}

function syncNum(
  item: GoodsRow,
  key: 'quantity' | 'grossWeightKg' | 'netWeightKg' | 'packagesCount' | 'customsValue',
  str: string,
) {
  const n = parseFloat(str.replace(',', '.'))
  item[key] = isNaN(n) ? null : n
  emit('update:modelValue', items.value.map(fromRow))
}

watch(
  () => props.modelValue,
  (v) => {
    items.value = (v ?? []).map(toRow)
  },
  { immediate: true },
)

function addItem() {
  items.value.push({
    description: null,
    tnvedCode: null,
    tnvedDescription: null,
    countryOfOrigin: null,
    quantity: null,
    unit: null,
    unitCode: null,
    grossWeightKg: null,
    netWeightKg: null,
    packagesCount: null,
    quantityTypeCode: null,
    customsValue: null,
    currency: 'USD',
    quantityStr: '',
    grossWeightStr: '',
    netWeightStr: '',
    packagesCountStr: '',
    customsValueStr: '',
  })
  emit('update:modelValue', items.value.map(fromRow))
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
  emit('update:modelValue', items.value.map(fromRow))
}
</script>

<style scoped>
.goods-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-muted);
  letter-spacing: 0.06em;
}

.empty-state {
  font-size: 12px;
  color: var(--atg-muted);
  font-style: italic;
  padding: 6px 0 2px;
}

.goods-card {
  border: 1px solid var(--atg-line);
  border-radius: 6px;
  padding: 10px 12px 8px;
  background: var(--atg-surface, var(--atg-bg));
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: -2px;
}

.card-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--atg-teal-soft, #e6f7f5);
  color: var(--atg-teal, #00b8a0);
  font-size: 11px;
  font-weight: 700;
}

.del-btn {
  color: var(--atg-danger, #ff4d4f) !important;
  padding: 0 4px !important;
  height: 20px !important;
  font-size: 13px !important;
}

.field-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.f-grow {
  flex: 1;
}

.f-2 {
  flex: 2;
  min-width: 0;
}

.f-narrow {
  flex: 1;
  min-width: 60px;
}

.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--atg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field :deep(.ant-input-sm),
.field :deep(.ant-select-sm .ant-select-selector) {
  font-size: 13px;
}

.field :deep(.ant-select-sm) {
  font-size: 13px;
}
</style>
