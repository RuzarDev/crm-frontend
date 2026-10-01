<template>
  <a-modal
    :open="open"
    :title="t('transit.zapolnenieIzInvoysa')"
    width="1040px"
    :confirm-loading="applying"
    :ok-text="t('transit.primenit')"
    :cancel-text="t('transit.zakryt')"
    :ok-button-props="{ style: { display: errorMessage ? 'none' : undefined } }"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <template v-if="result && !errorMessage">
      <a-space style="margin-bottom: 12px">
        <a-tag :color="result.aiUsed ? 'blue' : 'green'">
          {{ result.aiUsed ? t('transit.raspoznanoIi') : t('transit.poShablonu') }}
        </a-tag>
        <a-tag v-if="result.confidence != null">
          {{ t('transit.uverennost', { pct: Math.round(result.confidence * 100) }) }}
        </a-tag>
      </a-space>

      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item :label="t('transit.poluchatel')">
              <a-input v-model:value="header.consignee" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item :label="t('transit.otpravitel')">
              <a-input v-model:value="header.shipper" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item :label="t('transit.valyuta')">
              <a-input v-model:value="header.currencyCode" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <a-table
        :data-source="items"
        :columns="itemColumns"
        :pagination="false"
        row-key="__key"
        size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.dataIndex === 'commodityCode'">
            <a-input v-model:value="record.commodityCode" />
            <div v-if="record.commodityCodeDeprecation" class="deprecation-warning">
              {{ t('transit.kodUstarel', { codes: record.commodityCodeDeprecation.replacementCodes.join(', ') }) }}
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'customsValue'">
            <a-input-number v-model:value="record.customsValue" style="width: 100%" :min="0" />
          </template>
          <template v-else-if="column.dataIndex === 'weightKg'">
            <a-input-number v-model:value="record.weightKg" style="width: 100%" :min="0" />
          </template>
          <template v-else-if="column.dataIndex === 'quantity'">
            <a-input-number v-model:value="record.quantity" style="width: 100%" :min="0" />
          </template>
          <template v-else-if="column.dataIndex === 'actions'">
            <a-button danger type="link" size="small" @click="removeItem(index)">{{ t('transit.udalit') }}</a-button>
          </template>
        </template>
      </a-table>
      <a-button type="dashed" block style="margin-top: 8px" @click="addItem"> {{ t('transit.dobavitPoziciyu') }} </a-button>
    </template>
    <template v-else-if="errorMessage">
      <a-alert type="warning" :message="errorMessage" show-icon />
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, reactive, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { reestrApi } from '@/api/reestr'
import type {
  ApplyExtractionRequest,
  ExtractionHeaderValuesDto,
  ExtractionItemSuggestionDto,
  ExtractionResultDto,
} from '@/types/api'

const { t } = useI18n()

interface Props {
  open: boolean
  reestrId: string
  documentId: string
  result: ExtractionResultDto | null
  errorMessage: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'applied', count: number): void
  (e: 'cancel'): void
}>()

const applying = ref(false)

const header = reactive<ExtractionHeaderValuesDto>({
  consignee: null,
  shipper: null,
  currencyCode: null,
})

type ItemRow = ExtractionItemSuggestionDto & { __key: number }
const items = ref<ItemRow[]>([])
let itemKeyCounter = 0

const itemColumns = computed(() => ([

  { title: t('transit.kodTnved'), dataIndex: 'commodityCode', width: 240 },
  { title: t('transit.summa'), dataIndex: 'customsValue', width: 140 },
  { title: t('transit.vesKg'), dataIndex: 'weightKg', width: 120 },
  { title: t('transit.kolVo'), dataIndex: 'quantity', width: 100 },
  { title: '', dataIndex: 'actions', width: 80 },
]))
watch(
  () => props.result,
  (res) => {
    if (!res) return
    header.consignee = res.header.consignee
    header.shipper = res.header.shipper
    header.currencyCode = res.header.currencyCode
    items.value = res.items.map((item) => ({ ...item, __key: itemKeyCounter++ }))
  },
  { immediate: true },
)

const addItem = () => {
  items.value.push({
    commodityCode: null,
    customsValue: null,
    weightKg: null,
    quantity: null,
    commodityCodeDeprecation: null,
    __key: itemKeyCounter++,
  })
}

const removeItem = (index: number) => {
  items.value.splice(index, 1)
}

const handleOk = async () => {
  if (props.errorMessage) {
    emit('update:open', false)
    emit('cancel')
    return
  }
  if (items.value.length === 0) {
    message.error(t('transit.dobavteHotyaByOdnu'))
    return
  }

  applying.value = true
  try {
    const payload: ApplyExtractionRequest = {
      header: {
        consignee: header.consignee,
        shipper: header.shipper,
        currencyCode: header.currencyCode,
      },
      items: items.value.map((item) => ({
        commodityCode: item.commodityCode,
        customsValue: item.customsValue,
        weightKg: item.weightKg,
        quantity: item.quantity,
      })),
    }
    const response = await reestrApi.applyExtraction(props.reestrId, props.documentId, payload)
    message.success(t('transit.primenenoPoziciy', { n: response.entries.length }))
    emit('update:open', false)
    emit('applied', response.entries.length)
  } catch {
    //
  } finally {
    applying.value = false
  }
}

const handleCancel = () => {
  emit('update:open', false)
  emit('cancel')
}
</script>

<style scoped>
.deprecation-warning {
  margin-top: 4px;
  color: #d46b08;
  font-size: 12px;
}
</style>
