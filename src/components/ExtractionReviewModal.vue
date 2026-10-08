<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import { message } from '@/ui/message'
import { reestrApi } from '@/api/reestr'
import type {
  ApplyExtractionRequest,
  ExtractionHeaderValuesDto,
  ExtractionItemSuggestionDto,
  ExtractionResultDto,
} from '@/types/api'

// Окно проверки распознанного инвойса («Заполнить из инвойса» на вкладке «Документы» записи и «Импорт из инвойса» в списке):
// шапка (получатель, отправитель, валюта) и таблица позиций, которые можно поправить; «Применить» отправляет их на сервер.
// Нужна хотя бы одна позиция. Вариант с errorMessage — только предупреждение и «Закрыть».
const props = defineProps<{
  open: boolean
  reestrId: string
  documentId: string
  result: ExtractionResultDto | null
  errorMessage: string
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'applied', count: number): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()
const applying = ref(false)

const header = reactive<ExtractionHeaderValuesDto>({ consignee: null, shipper: null, currencyCode: null })

type ItemRow = ExtractionItemSuggestionDto & { __key: number }
const items = ref<ItemRow[]>([])
let itemKeyCounter = 0

const itemColumns = computed(() => [
  { title: t('transit.kodTnved'), key: 'commodityCode', minWidth: 220 },
  { title: t('transit.summa'), key: 'customsValue', width: 150 },
  { title: t('transit.vesKg'), key: 'weightKg', width: 130 },
  { title: t('transit.kolVo'), key: 'quantity', width: 110 },
  { title: '', key: 'actions', width: 56 },
])

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

const close = () => {
  emit('update:open', false)
  emit('cancel')
}

const handleOk = async () => {
  if (props.errorMessage) {
    close()
    return
  }
  if (items.value.length === 0) {
    message.error(t('transit.dobavteHotyaByOdnu'))
    return
  }
  applying.value = true
  try {
    const payload: ApplyExtractionRequest = {
      header: { consignee: header.consignee, shipper: header.shipper, currencyCode: header.currencyCode },
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
    // Текст ошибки показал общий перехватчик (api/client.ts); окно остаётся открытым.
  } finally {
    applying.value = false
  }
}

// Поля таблицы на телефоне (карточки): подпись слева, поле справа фиксированной ширины.
const cell = 'w-full max-sm:w-44 max-sm:*:h-11'
</script>

<template>
  <ZModal
    :open="open"
    :title="t('transit.zapolnenieIzInvoysa')"
    :width="1040"
    :confirm-loading="applying"
    :ok-text="t('transit.primenit')"
    :cancel-text="t('transit.zakryt')"
    @update:open="emit('update:open', $event)"
    @ok="handleOk"
    @cancel="emit('cancel')"
  >
    <template v-if="errorMessage" #footer>
      <ZButton variant="primary" class="max-sm:h-11" data-extraction-close @click="close">{{ t('transit.zakryt') }}</ZButton>
    </template>

    <template v-if="result && !errorMessage">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <ZTag :tone="result.aiUsed ? 'info' : 'done'">{{ result.aiUsed ? t('transit.raspoznanoIi') : t('transit.poShablonu') }}</ZTag>
        <ZTag v-if="result.confidence != null" tone="neutral">{{ t('transit.uverennost', { pct: Math.round(result.confidence * 100) }) }}</ZTag>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ZField :label="t('transit.poluchatel')">
          <ZInput v-model:value="header.consignee" class="max-sm:h-11" data-header="consignee" />
        </ZField>
        <ZField :label="t('transit.otpravitel')">
          <ZInput v-model:value="header.shipper" class="max-sm:h-11" data-header="shipper" />
        </ZField>
        <ZField :label="t('transit.valyuta')">
          <ZInput v-model:value="header.currencyCode" class="max-sm:h-11" data-header="currencyCode" />
        </ZField>
      </div>

      <ZTable
        :data-source="items"
        :columns="itemColumns"
        row-key="__key"
        size="small"
        :pagination="false"
        :aria-label="t('broker.transitRecord.extraction.itemsLabel')"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'commodityCode'">
            <ZInput
              v-model:value="record.commodityCode"
              mono
              :class="cell"
              :aria-label="`${t('transit.kodTnved')} ${index + 1}`"
              data-item="commodityCode"
            />
            <div v-if="record.commodityCodeDeprecation" class="mt-1 text-xs text-gold-ink" data-item-deprecation>
              {{ t('transit.kodUstarel', { codes: record.commodityCodeDeprecation.replacementCodes.join(', ') }) }}
            </div>
          </template>
          <ZNumber
            v-else-if="column.key === 'customsValue'"
            v-model:value="record.customsValue"
            :min="0"
            :class="cell"
            :aria-label="`${t('transit.summa')} ${index + 1}`"
            data-item="customsValue"
          />
          <ZNumber
            v-else-if="column.key === 'weightKg'"
            v-model:value="record.weightKg"
            :min="0"
            :class="cell"
            :aria-label="`${t('transit.vesKg')} ${index + 1}`"
            data-item="weightKg"
          />
          <ZNumber
            v-else-if="column.key === 'quantity'"
            v-model:value="record.quantity"
            :min="0"
            :class="cell"
            :aria-label="`${t('transit.kolVo')} ${index + 1}`"
            data-item="quantity"
          />
          <button
            v-else-if="column.key === 'actions'"
            type="button"
            class="inline-flex size-9 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus motion-reduce:transition-none max-sm:size-11"
            :aria-label="t('broker.transitRecord.extraction.removeItem', { n: index + 1 })"
            :title="t('broker.transitRecord.extraction.removeItem', { n: index + 1 })"
            data-item-remove
            @click="removeItem(index)"
          >
            <PhTrash :size="17" aria-hidden="true" />
          </button>
        </template>
      </ZTable>

      <ZButton class="mt-3 border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11 max-sm:w-full" data-item-add @click="addItem">
        <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
        {{ t('broker.transitRecord.extraction.addItem') }}
      </ZButton>
    </template>
    <ZAlert v-else-if="errorMessage" type="warning" :message="errorMessage" show-icon />
  </ZModal>
</template>
