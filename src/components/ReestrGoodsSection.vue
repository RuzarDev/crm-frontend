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
        <span class="card-num">{{ idx + 1 }}</span>
        <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)">✕</a-button>
      </div>

      <!-- Row 1: наименование (wide) -->
      <div class="field-row">
        <div class="field f-grow">
          <div class="field-label">Наименование товара</div>
          <a-input
            v-model:value="item.description"
            size="small"
            :disabled="readonly"
            placeholder="Описание товара"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row 2: код тнвэд + страна -->
      <div class="field-row">
        <div class="field f-2">
          <div class="field-label">Код ТНВЭД</div>
          <a-input
            v-model:value="item.tnvedCode"
            size="small"
            :disabled="readonly"
            placeholder="0000000000"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
        <div class="field f-2">
          <div class="field-label">Страна происхождения</div>
          <a-input
            v-model:value="item.countryOfOrigin"
            size="small"
            :disabled="readonly"
            placeholder="CN, KZ, RU…"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row 3: кол-во + ед.изм + брутто + нетто -->
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
          <div class="field-label">Ед. изм.</div>
          <a-select
            v-model:value="item.unit"
            size="small"
            :disabled="readonly"
            show-search
            allow-clear
            style="width: 100%"
            :options="unitOptions"
            placeholder="шт"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
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
      </div>

      <!-- Row 4: там.стоимость + валюта -->
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
import { ref, watch } from 'vue'
import type { ReestrGoodsItemInput } from '@/types/api'

interface GoodsRow extends ReestrGoodsItemInput {
  quantityStr: string
  grossWeightStr: string
  netWeightStr: string
  customsValueStr: string
}

const props = defineProps<{
  modelValue: ReestrGoodsItemInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrGoodsItemInput[]): void
}>()

const UNITS = [
  { value: 'шт', label: 'шт — штука' },
  { value: 'кг', label: 'кг — килограмм' },
  { value: 'г', label: 'г — грамм' },
  { value: 'л', label: 'л — литр' },
  { value: 'м', label: 'м — метр' },
  { value: 'м²', label: 'м² — квадратный метр' },
  { value: 'м³', label: 'м³ — кубический метр' },
  { value: 'упак', label: 'упак — упаковка' },
  { value: 'кор', label: 'кор — коробка' },
  { value: 'паллет', label: 'паллет — паллет' },
  { value: 'рулон', label: 'рулон — рулон' },
  { value: 'компл', label: 'компл — комплект' },
  { value: 'пара', label: 'пара — пара' },
  { value: 'т', label: 'т — тонна' },
]
const unitOptions = UNITS

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
    customsValueStr: g.customsValue != null ? String(g.customsValue) : '',
  }
}

function fromRow(r: GoodsRow): ReestrGoodsItemInput {
  return {
    description: r.description || null,
    tnvedCode: r.tnvedCode || null,
    countryOfOrigin: r.countryOfOrigin || null,
    quantity: r.quantity,
    unit: r.unit || null,
    grossWeightKg: r.grossWeightKg,
    netWeightKg: r.netWeightKg,
    customsValue: r.customsValue,
    currency: r.currency || null,
  }
}

function syncNum(
  item: GoodsRow,
  key: 'quantity' | 'grossWeightKg' | 'netWeightKg' | 'customsValue',
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
    countryOfOrigin: null,
    quantity: null,
    unit: null,
    grossWeightKg: null,
    netWeightKg: null,
    customsValue: null,
    currency: 'USD',
    quantityStr: '',
    grossWeightStr: '',
    netWeightStr: '',
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
