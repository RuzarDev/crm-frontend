<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhSparkle, PhX } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZTag from '@/components/z/ZTag.vue'
import { invoiceApi } from '@/api/invoice'
import type { ExtractionResultDto, ReestrGoodsItemInput, TnvedDeprecationWarningDto } from '@/types/api'
import { message } from '@/ui/message'
import { pluralForm } from '@/views/broker/list'

// «Из инвойса» (прежний InvoiceGoodsImporter на Z): кнопка → файл PDF или XLSX до 10 МБ → POST /invoice/extract
// (с id клиента партии) → окно «Товары из инвойса»: «Распознано ИИ» / «По шаблону», уверенность, предупреждение,
// если автораспознавание не удалось; валюта и таблица позиций с правкой (наименование, код, сумма, брутто, кол-во),
// «Добавить позицию». Позиции → товары реестра, как раньше (описание — из наименования, валюта — общая).
// Товары уже есть — выбор «Заменить товары» / «Добавить к существующим» (раньше молча заменяло, B13.9).
// Ошибку распознавания показывает перехватчик — своего тоста нет (B13.6).
const props = withDefaults(defineProps<{ clientId?: string; existingCount: number; disabled?: boolean }>(), { clientId: undefined, disabled: false })
const emit = defineEmits<{ imported: [items: ReestrGoodsItemInput[], mode: 'replace' | 'append'] }>()
const { t, locale } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.partia.import.${key}`, p ?? {})

interface Row {
  key: number
  description: string | null
  tnvedCode: string | null
  customsValue: number | null
  grossWeightKg: number | null
  quantity: number | null
  deprecation: TnvedDeprecationWarningDto | null
}

const MAX_BYTES = 10 * 1024 * 1024
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const open = ref(false)
const result = ref<ExtractionResultDto | null>(null)
const currency = ref('USD')
const rows = ref<Row[]>([])
let nextKey = 0

const pick = () => {
  if (props.disabled || busy.value) return
  fileInput.value?.click()
}
const onFile = async (e: Event) => {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf') && !name.endsWith('.xlsx')) {
    message.error(tr('onlyPdfXlsx'))
    return
  }
  if (file.size > MAX_BYTES) {
    message.error(tr('tooBig'))
    return
  }
  busy.value = true
  try {
    const res = await invoiceApi.extractGoods(file, props.clientId)
    result.value = res
    currency.value = res.header.currencyCode ?? 'USD'
    rows.value = res.items.map((item) => ({
      key: ++nextKey,
      description: null,
      tnvedCode: item.commodityCode,
      customsValue: item.customsValue != null ? Number(item.customsValue) : null,
      grossWeightKg: item.weightKg != null ? Number(item.weightKg) : null,
      quantity: item.quantity != null ? Number(item.quantity) : null,
      deprecation: item.commodityCodeDeprecation ?? null,
    }))
    open.value = true
  } catch {
    // тост показал перехватчик
  } finally {
    busy.value = false
  }
}

const failed = computed(() => result.value?.status === 'needsManualEntry' || result.value?.status === 'error')
const existingText = computed(() => tr(`existing.${pluralForm(props.existingCount, locale.value)}`, { n: props.existingCount }))

const listEl = ref<HTMLElement | null>(null)
const addRow = async () => {
  rows.value.push({ key: ++nextKey, description: null, tnvedCode: null, customsValue: null, grossWeightKg: null, quantity: null, deprecation: null })
  await nextTick()
  const els = listEl.value?.querySelectorAll<HTMLElement>('[data-import-row]')
  els?.[els.length - 1]?.querySelector<HTMLElement>('[data-import-f="description"] input, input[data-import-f="description"]')?.focus()
}
const removeRow = (row: Row) => {
  const at = rows.value.indexOf(row)
  if (at >= 0) rows.value.splice(at, 1)
}

const nul = (v: string | null | undefined) => {
  const s = (v ?? '').trim()
  return s || null
}
const apply = (mode: 'replace' | 'append') => {
  if (!rows.value.length) return
  const cur = nul(currency.value)
  const items: ReestrGoodsItemInput[] = rows.value.map((r) => ({
    description: nul(r.description),
    tnvedCode: nul(r.tnvedCode),
    tnvedDescription: null,
    countryOfOrigin: null,
    quantity: r.quantity,
    unit: null,
    unitCode: null,
    grossWeightKg: r.grossWeightKg,
    netWeightKg: null,
    packagesCount: null,
    quantityTypeCode: null,
    customsValue: r.customsValue,
    currency: cur,
  }))
  open.value = false
  emit('imported', items, mode)
}

const cols = 'sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto]'
const cellLabel = 'text-xs leading-4 text-ink-3 sm:sr-only'
const cell = 'flex min-w-0 flex-col gap-1'
const ctl = 'max-sm:h-11'
const iconBtn = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
</script>

<template>
  <div class="contents" data-invoice-import>
    <input ref="fileInput" type="file" class="hidden" tabindex="-1" aria-hidden="true" accept=".pdf,.xlsx" data-import-input @change="onFile">
    <ZButton
      class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11"
      :loading="busy"
      :disabled="disabled"
      data-import-button
      @click="pick"
    >
      <template #icon><PhSparkle :size="16" aria-hidden="true" /></template>
      {{ tr('button') }}
    </ZButton>

    <ZModal v-model:open="open" :title="tr('title')" :width="860" data-import-modal>
      <div v-if="result" class="flex flex-col gap-3.5">
        <div class="flex flex-wrap items-center gap-2" data-import-tags>
          <ZTag :tone="result.aiUsed ? 'info' : 'done'" data-import-source>{{ result.aiUsed ? tr('ai') : tr('template') }}</ZTag>
          <ZTag v-if="result.confidence != null" data-import-confidence>{{ tr('confidence', { pct: Math.round(result.confidence * 100) }) }}</ZTag>
        </div>
        <ZAlert v-if="failed" type="warning" show-icon :message="tr('failed')" data-import-failed />
        <p v-if="existingCount > 0" class="m-0 text-sm text-ink-2" data-import-existing>{{ existingText }}</p>

        <label class="flex items-center gap-2 text-sm font-medium text-ink-2">
          {{ tr('currency') }}
          <ZInput :value="currency" :maxlength="3" mono placeholder="USD" class="w-24 max-sm:h-11" data-import-currency @update:value="currency = $event.toUpperCase()" />
        </label>

        <p v-if="!rows.length" class="m-0 text-sm text-ink-3" data-import-empty>{{ tr('noRows') }}</p>
        <div v-else ref="listEl" class="min-w-0 sm:overflow-hidden sm:rounded-row sm:border sm:border-line">
          <div aria-hidden="true" :class="['hidden gap-2 border-b border-line bg-canvas px-3 py-2 text-xs leading-4 font-medium text-ink-3 sm:grid', cols]">
            <span>{{ tr('name') }}</span><span>{{ tr('code') }}</span><span>{{ tr('value') }}</span><span>{{ tr('gross') }}</span><span>{{ tr('qty') }}</span><span />
          </div>
          <ul role="list" class="m-0 flex list-none flex-col p-0 max-sm:gap-2.5">
            <li
              v-for="(row, index) in rows"
              :key="row.key"
              :class="['grid grid-cols-1 gap-3 max-sm:rounded-row max-sm:border max-sm:border-line max-sm:p-3 sm:items-start sm:gap-2 sm:border-t sm:border-line sm:px-3 sm:py-2 sm:first:border-t-0', cols]"
              data-import-row
            >
              <label :class="cell">
                <span :class="cellLabel">{{ tr('name') }}</span>
                <ZInput :value="row.description" placeholder="—" :class="ctl" data-import-f="description" @update:value="row.description = $event" />
              </label>
              <label :class="cell">
                <span :class="cellLabel">{{ tr('code') }}</span>
                <ZInput :value="row.tnvedCode" mono :maxlength="10" placeholder="0000000000" :class="ctl" data-import-f="tnvedCode" @update:value="row.tnvedCode = $event" />
                <span v-if="row.deprecation" class="text-xs leading-4 text-gold-ink" data-import-deprecated>
                  {{ tr('deprecated', { codes: row.deprecation.replacementCodes.join(', ') }) }}
                </span>
              </label>
              <label :class="cell">
                <span :class="cellLabel">{{ tr('value') }}</span>
                <ZNumber :value="row.customsValue" :min="0" :class="ctl" data-import-f="customsValue" @update:value="row.customsValue = $event" />
              </label>
              <label :class="cell">
                <span :class="cellLabel">{{ tr('gross') }}</span>
                <ZNumber :value="row.grossWeightKg" :min="0" :class="ctl" data-import-f="grossWeightKg" @update:value="row.grossWeightKg = $event" />
              </label>
              <label :class="cell">
                <span :class="cellLabel">{{ tr('qty') }}</span>
                <ZNumber :value="row.quantity" :min="0" :class="ctl" data-import-f="quantity" @update:value="row.quantity = $event" />
              </label>
              <div class="flex justify-end">
                <button type="button" :class="iconBtn" :aria-label="tr('removeRow', { n: index + 1 })" data-import-remove @click="removeRow(row)">
                  <PhX :size="16" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>
        </div>
        <div>
          <ZButton variant="ghost" class="max-sm:h-11" data-import-add @click="addRow">
            <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
            {{ tr('addRow') }}
          </ZButton>
        </div>
      </div>

      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
          <ZButton variant="ghost" class="max-sm:h-11" data-import-cancel @click="open = false">{{ tr('cancel') }}</ZButton>
          <template v-if="existingCount > 0">
            <ZButton
              class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11"
              :disabled="!rows.length"
              data-import-append
              @click="apply('append')"
            >{{ tr('append') }}</ZButton>
            <ZButton variant="primary" :disabled="!rows.length" class="max-sm:h-11" data-import-replace @click="apply('replace')">{{ tr('replace') }}</ZButton>
          </template>
          <ZButton v-else variant="primary" :disabled="!rows.length" class="max-sm:h-11" data-import-apply @click="apply('replace')">{{ tr('apply') }}</ZButton>
        </div>
      </template>
    </ZModal>
  </div>
</template>
