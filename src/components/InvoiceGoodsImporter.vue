<template>
  <div class="invoice-goods-importer">
    <a-upload
      :show-upload-list="false"
      :before-upload="onFile"
      :custom-request="() => {}"
      accept=".pdf,.xlsx"
    >
      <a-button size="small" :loading="busy">
        <UploadOutlined />
        Загрузить инвойс
      </a-button>
    </a-upload>

    <a-modal
      v-model:open="reviewOpen"
      title="Товары из инвойса"
      width="820px"
      ok-text="Применить"
      cancel-text="Отмена"
      :ok-button-props="{ disabled: items.length === 0 }"
      @ok="handleApply"
      @cancel="reviewOpen = false"
    >
      <template v-if="result">
        <a-space style="margin-bottom: 12px">
          <a-tag :color="result.aiUsed ? 'blue' : 'green'">
            {{ result.aiUsed ? 'Распознано ИИ' : 'По шаблону' }}
          </a-tag>
          <a-tag v-if="result.confidence != null">
            Уверенность: {{ Math.round(result.confidence * 100) }}%
          </a-tag>
        </a-space>

        <a-alert
          v-if="result.status === 'needsManualEntry' || result.status === 'error'"
          type="warning"
          message="Автораспознавание не удалось — добавьте позиции вручную"
          show-icon
          style="margin-bottom: 12px"
        />

        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="font-size: 13px; font-weight: 600; color: var(--atg-charcoal);">Валюта:</span>
          <a-input v-model:value="currency" style="width: 100px;" size="small" placeholder="USD" />
        </div>

        <a-table
          :data-source="items"
          :columns="columns"
          :pagination="false"
          row-key="__key"
          size="small"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.dataIndex === 'description'">
              <a-input v-model:value="record.description" size="small" placeholder="—" />
            </template>
            <template v-else-if="column.dataIndex === 'tnvedCode'">
              <a-input v-model:value="record.tnvedCode" size="small" placeholder="0000000000" />
              <div v-if="record.deprecation" style="font-size: 11px; color: #d46b08; margin-top: 2px;">
                Код устарел → {{ record.deprecation.replacementCodes.join(', ') }}
              </div>
            </template>
            <template v-else-if="column.dataIndex === 'customsValue'">
              <a-input-number v-model:value="record.customsValue" style="width: 100%" size="small" :min="0" />
            </template>
            <template v-else-if="column.dataIndex === 'grossWeightKg'">
              <a-input-number v-model:value="record.grossWeightKg" style="width: 100%" size="small" :min="0" />
            </template>
            <template v-else-if="column.dataIndex === 'quantity'">
              <a-input-number v-model:value="record.quantity" style="width: 100%" size="small" :min="0" />
            </template>
            <template v-else-if="column.dataIndex === 'actions'">
              <a-button type="link" danger size="small" @click="removeItem(index)">✕</a-button>
            </template>
          </template>
        </a-table>
        <a-button type="dashed" block style="margin-top: 8px" @click="addItem">+ Добавить позицию</a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { UploadOutlined } from '@ant-design/icons-vue'
import { invoiceApi } from '@/api/invoice'
import type { ExtractionResultDto, ReestrGoodsItemInput, TnvedDeprecationWarningDto } from '@/types/api'

interface ReviewItem {
  __key: number
  description: string | null
  tnvedCode: string | null
  customsValue: number | null
  grossWeightKg: number | null
  quantity: number | null
  deprecation: TnvedDeprecationWarningDto | null
}

const props = defineProps<{
  clientId?: string
}>()

const emit = defineEmits<{
  (e: 'imported', items: ReestrGoodsItemInput[]): void
}>()

let itemKey = 0
const busy = ref(false)
const reviewOpen = ref(false)
const result = ref<ExtractionResultDto | null>(null)
const currency = ref('USD')
const items = ref<ReviewItem[]>([])

const columns = [
  { title: 'Наименование', dataIndex: 'description', width: 180 },
  { title: 'Код ТНВЭД', dataIndex: 'tnvedCode', width: 160 },
  { title: 'Сумма', dataIndex: 'customsValue', width: 110 },
  { title: 'Брутто, кг', dataIndex: 'grossWeightKg', width: 110 },
  { title: 'Кол-во', dataIndex: 'quantity', width: 100 },
  { title: '', dataIndex: 'actions', width: 60 },
]

const onFile: UploadProps['beforeUpload'] = (file) => {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf') && !name.endsWith('.xlsx')) {
    message.error('Допустимы только PDF и XLSX')
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    message.error('Файл превышает 10 МБ')
    return false
  }
  void run(file as File)
  return false
}

const run = async (file: File) => {
  busy.value = true
  try {
    const res = await invoiceApi.extractGoods(file, props.clientId)
    result.value = res
    currency.value = res.header.currencyCode ?? 'USD'
    items.value = res.items.map((item) => ({
      __key: itemKey++,
      description: null,
      tnvedCode: item.commodityCode,
      customsValue: item.customsValue != null ? Number(item.customsValue) : null,
      grossWeightKg: item.weightKg != null ? Number(item.weightKg) : null,
      quantity: item.quantity != null ? Number(item.quantity) : null,
      deprecation: item.commodityCodeDeprecation ?? null,
    }))
    reviewOpen.value = true
  } catch {
    message.error('Не удалось распознать инвойс')
  } finally {
    busy.value = false
  }
}

const addItem = () => {
  items.value.push({
    __key: itemKey++,
    description: null,
    tnvedCode: null,
    customsValue: null,
    grossWeightKg: null,
    quantity: null,
    deprecation: null,
  })
}

const removeItem = (idx: number) => {
  items.value.splice(idx, 1)
}

const handleApply = () => {
  const mapped: ReestrGoodsItemInput[] = items.value.map((item) => ({
    description: item.description || null,
    tnvedCode: item.tnvedCode || null,
    countryOfOrigin: null,
    quantity: item.quantity,
    unit: null,
    grossWeightKg: item.grossWeightKg,
    netWeightKg: null,
    customsValue: item.customsValue,
    currency: currency.value || null,
  }))
  reviewOpen.value = false
  emit('imported', mapped)
}
</script>

<style scoped>
.invoice-goods-importer {
  display: inline-block;
}
</style>
