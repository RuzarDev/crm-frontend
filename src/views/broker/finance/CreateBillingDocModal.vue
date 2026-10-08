<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { billingApi, type BrokerInvoiceKind } from '@/api/billing'
import type { Import40CaseDto } from '@/api/import40'
import type { SalesServiceItem } from '@/api/sales'
import { formatMoney } from '@/ui/number'
import { message } from '@/ui/message'

// Окно «Новый документ» (счёт AQNIET или акт): создаёт черновик, выставляют его потом из таблицы.
// Справочники (клиенты, заявки, прайс, ставка НДС организации) грузит экран и передаёт сюда.
// preset — заявка и клиент из ?caseId= (кнопка «Выставить счёт» в карточке заявки).
// Цены прайса — с НДС: сервер выделяет НДС из суммы по настройкам организации, ставку не отправляем.
export interface BillingDocPreset { caseId?: string; clientId?: string }

const props = defineProps<{
  open: boolean
  clients: { value: string; label: string }[]
  cases: Import40CaseDto[]
  tariffs: SalesServiceItem[]
  /** null — настройки организации ещё не пришли (подсказку НДС не показываем). */
  vatRate: number | null
  preset?: BillingDocPreset | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; created: [] }>()
const { t } = useI18n()

// id — ключ строки в списке: при удалении строки из середины поля остальных не перепутываются (ключ-индекс
// перенёс бы состояние полей на соседнюю строку). На сервер не уходит.
interface Line { id: number; name: string; unit: string; quantity: number | null; unitPrice: number | null }
let lineSeq = 0
const blankLine = (): Line => ({ id: ++lineSeq, name: '', unit: '', quantity: 1, unitPrice: 0 })

const draft = reactive({
  kind: 'invoice' as BrokerInvoiceKind,
  clientId: null as string | null,
  caseId: null as string | null,
  dueDate: null as string | null,
  note: '',
  lines: [blankLine()] as Line[],
})
const saving = ref(false)

// Каждое открытие — чистая форма, включая заявку (раньше заявка прошлого открытия уходила скрытым значением).
// Новый preset при открытом окне (другой ?caseId=) — тоже чистая форма с новыми заявкой и клиентом.
watch([() => props.open, () => props.preset], ([v]) => {
  if (!v) return
  draft.kind = 'invoice'
  draft.clientId = props.preset?.clientId ?? null
  draft.caseId = props.preset?.caseId ?? null
  draft.dueDate = null
  draft.note = ''
  draft.lines = [blankLine()]
}, { immediate: true })

const caseClient = (id: string | null) => (id ? props.cases.find((c) => c.id === id)?.clientId : undefined)
// Смена клиента: заявка другого клиента не остаётся (заявка не из списка — оставляем, проверить нечем).
const setClient = (id: string | null) => {
  draft.clientId = id
  const owner = caseClient(draft.caseId)
  if (id && owner && owner !== id) draft.caseId = null
}

const kindOptions = computed(() => [
  { value: 'invoice', label: t('billing.invoice') },
  { value: 'act', label: t('billing.act') },
])
const caseOptions = computed(() => props.cases
  .filter((c) => !draft.clientId || c.clientId === draft.clientId)
  .map((c) => ({ value: c.id, label: c.cargo ? `${c.number} · ${c.cargo}` : c.number })))
// Подсказки услуги: значение — название (оно и попадает в поле); одинаковые названия — одна подсказка.
const tariffOptions = computed(() => {
  const seen = new Set<string>()
  return props.tariffs
    .filter((s) => !seen.has(s.name) && !!seen.add(s.name))
    .map((s) => ({ value: s.name, label: `${s.name} — ${formatMoney(s.price)}` }))
})
const applyTariff = (line: Line, name: string | number) => {
  const tariff = props.tariffs.find((s) => s.name === String(name))
  if (!tariff) return
  line.unit = tariff.unit
  line.unitPrice = tariff.price
}

const lineAmount = (l: Line) => (l.quantity || 0) * (l.unitPrice || 0)
const total = computed(() => draft.lines.reduce((a, l) => a + lineAmount(l), 0))
const filledLines = computed(() => draft.lines.filter((l) => (l.name ?? '').trim()))
const canSubmit = computed(() => !!draft.clientId && filledLines.value.length > 0)
const vatHint = computed(() => {
  if (props.vatRate === null) return ''
  return props.vatRate > 0 ? t('billing.vatFromTotal', { rate: props.vatRate }) : t('billing.noVat')
})

const addLine = () => { draft.lines.push(blankLine()) }
const removeLine = (i: number) => { draft.lines.splice(i, 1) }

const submit = async () => {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    await billingApi.create({
      clientId: draft.clientId!,
      caseId: draft.caseId ?? null,
      kind: draft.kind,
      dueDateUtc: draft.dueDate ? `${draft.dueDate}T00:00:00Z` : null,
      note: draft.note || null,
      lines: filledLines.value.map((l) => ({
        name: l.name.trim(), unit: l.unit, quantity: l.quantity || 1, unitPrice: l.unitPrice || 0,
      })),
    })
    emit('update:open', false)
    message.success(t('billing.created'))
    emit('created')
  } catch (e: unknown) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай; окно остаётся.
    if (!(e as { response?: unknown })?.response) message.error(t('billing.saveError'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('billing.newDoc')"
    :width="760"
    :ok-text="t('billing.create')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: !canSubmit }"
    data-create-billing
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-2">
      <div class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <ZField :label="t('billing.kind')">
          <ZSelect
            :value="draft.kind"
            :options="kindOptions"
            data-create-kind
            @update:value="draft.kind = ($event as BrokerInvoiceKind)"
          />
        </ZField>
        <ZField :label="t('billing.client')" required>
          <ZSelect
            :value="draft.clientId"
            :options="clients"
            show-search
            :placeholder="t('billing.clientPh')"
            data-create-client
            @update:value="setClient($event as string | null)"
          />
        </ZField>
        <ZField :label="t('billing.case')">
          <ZSelect
            :value="draft.caseId"
            :options="caseOptions"
            show-search
            allow-clear
            :placeholder="t('billing.casePh')"
            data-create-case
            @update:value="draft.caseId = ($event as string | null)"
          />
        </ZField>
        <ZField :label="t('billing.due')">
          <ZDate :value="draft.dueDate" allow-clear data-create-due @update:value="draft.dueDate = $event" />
        </ZField>
      </div>

      <div class="flex flex-col gap-2" role="group" :aria-label="t('billing.services')">
        <div class="text-sm font-medium text-ink-2">{{ t('billing.services') }}</div>
        <div
          v-for="(l, i) in draft.lines"
          :key="l.id"
          class="flex flex-wrap items-center gap-2 max-sm:border-b max-sm:border-line max-sm:pb-3"
          data-create-line
        >
          <ZCombobox
            :value="l.name"
            :options="tariffOptions"
            allow-clear
            :placeholder="t('billing.servicePh')"
            :aria-label="t('broker.billing.create.service')"
            :popup-width="420"
            class="min-w-0 basis-full sm:flex-1 sm:basis-56 max-sm:*:h-11"
            data-create-service
            @update:value="l.name = $event"
            @select="(v: string | number) => applyTariff(l, v)"
          />
          <ZInput
            :value="l.unit"
            :placeholder="t('billing.unit')"
            :aria-label="t('billing.unit')"
            class="w-20 max-sm:h-11"
            data-create-unit
            @update:value="l.unit = $event"
          />
          <ZNumber
            :value="l.quantity"
            :min="0.01"
            :placeholder="t('billing.qty')"
            :aria-label="t('billing.qty')"
            class="w-20 max-sm:h-11"
            data-create-qty
            @update:value="l.quantity = $event"
          />
          <ZNumber
            :value="l.unitPrice"
            :min="0"
            :step="1000"
            :placeholder="t('billing.price')"
            :aria-label="t('billing.price')"
            class="w-32 max-sm:h-11"
            data-create-price
            @update:value="l.unitPrice = $event"
          />
          <span class="min-w-24 flex-1 text-right text-sm font-semibold whitespace-nowrap text-ink tabular-nums sm:flex-none" data-create-amount>{{ formatMoney(lineAmount(l)) }}</span>
          <button
            type="button"
            class="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-danger focus-visible:shadow-focus max-sm:size-11"
            :aria-label="t('broker.billing.create.removeLine')"
            :title="t('broker.billing.create.removeLine')"
            data-create-remove
            @click="removeLine(i)"
          >
            <PhX :size="14" aria-hidden="true" />
          </button>
        </div>
        <div>
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-create-add @click="addLine">
            <template #icon><PhPlus :size="14" weight="bold" aria-hidden="true" /></template>
            {{ t('billing.addLine') }}
          </ZButton>
        </div>
      </div>

      <ZField :label="t('billing.note')">
        <ZInput :value="draft.note" :placeholder="t('billing.notePh')" data-create-note @update:value="draft.note = $event" />
      </ZField>

      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-3">
        <span class="text-sm text-ink-2">{{ t('billing.draftTotal') }}:</span>
        <b class="text-base font-semibold text-ink tabular-nums" data-create-total>{{ formatMoney(total) }}</b>
        <span v-if="vatHint" class="text-xs text-muted" data-create-vat>{{ vatHint }}</span>
      </div>
    </div>
  </ZModal>
</template>
