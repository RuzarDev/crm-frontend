<template>
  <div class="goods-section">
    <div class="section-header">
      <span class="section-title">Товары</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">+ Добавить товар</a-button>
    </div>

    <div v-if="items.length === 0" class="empty-hint">
      {{ readonly ? 'Нет товаров' : 'Нажмите «+ Добавить товар» чтобы добавить позицию' }}
    </div>

    <div v-for="(item, idx) in items" :key="idx" class="goods-row">
      <div class="goods-row-header">
        <span class="goods-row-num">{{ idx + 1 }}</span>
        <a-button v-if="!readonly" type="text" danger size="small" @click="removeItem(idx)">✕</a-button>
      </div>
      <div class="goods-fields">
        <div class="gf gf-wide">
          <div class="gf-label">Наименование</div>
          <a-input v-model:value="item.description" size="small" :disabled="readonly" placeholder="—" @change="emit('update:modelValue', items.map(fromRow))" />
        </div>
        <div class="gf">
          <div class="gf-label">Код ТНВЭД</div>
          <a-input v-model:value="item.tnvedCode" size="small" :disabled="readonly" placeholder="—" @change="emit('update:modelValue', items.map(fromRow))" />
        </div>
        <div class="gf">
          <div class="gf-label">Страна происхождения</div>
          <a-input v-model:value="item.countryOfOrigin" size="small" :disabled="readonly" placeholder="—" @change="emit('update:modelValue', items.map(fromRow))" />
        </div>
        <div class="gf gf-narrow">
          <div class="gf-label">Кол-во</div>
          <a-input v-model:value="item.quantityStr" size="small" :disabled="readonly" placeholder="—" @blur="syncNum(item, 'quantity', item.quantityStr)" />
        </div>
        <div class="gf gf-narrow">
          <div class="gf-label">Ед. изм.</div>
          <a-input v-model:value="item.unit" size="small" :disabled="readonly" placeholder="—" @change="emit('update:modelValue', items.map(fromRow))" />
        </div>
        <div class="gf gf-narrow">
          <div class="gf-label">Брутто, кг</div>
          <a-input v-model:value="item.grossWeightStr" size="small" :disabled="readonly" placeholder="—" @blur="syncNum(item, 'grossWeightKg', item.grossWeightStr)" />
        </div>
        <div class="gf gf-narrow">
          <div class="gf-label">Нетто, кг</div>
          <a-input v-model:value="item.netWeightStr" size="small" :disabled="readonly" placeholder="—" @blur="syncNum(item, 'netWeightKg', item.netWeightStr)" />
        </div>
        <div class="gf gf-narrow">
          <div class="gf-label">Там. стоимость</div>
          <a-input v-model:value="item.customsValueStr" size="small" :disabled="readonly" placeholder="—" @blur="syncNum(item, 'customsValue', item.customsValueStr)" />
        </div>
        <div class="gf gf-narrow">
          <div class="gf-label">Валюта</div>
          <a-input v-model:value="item.currency" size="small" :disabled="readonly" placeholder="USD" maxlength="8" @change="emit('update:modelValue', items.map(fromRow))" />
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
    currency: null,
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
  gap: 8px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--atg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.empty-hint {
  font-size: 12px;
  color: var(--atg-muted);
  font-style: italic;
  padding: 4px 0;
}
.goods-row {
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-sm);
  padding: 8px 10px;
  background: var(--atg-bg);
}
.goods-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.goods-row-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-teal);
}
.goods-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
}
.gf-wide {
  grid-column: span 2;
}
.gf {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.gf-label {
  font-size: 10px;
  color: var(--atg-muted);
  font-weight: 600;
  white-space: nowrap;
}
.gf :deep(.ant-input-sm) {
  font-size: 13px;
}
</style>
