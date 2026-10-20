<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFileXls, PhPencilSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { shipmentCostApi, type ShipmentCostDto, type ShipmentCostPart } from '@/api/shipmentCost'
import { saveBlob } from '@/ui/download'
import { formatMoneyIn, formatNumberIn } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { costAvailable, COST_NOTE_MAX } from '@/views/client/shipment/cost'
import { utilizationStatusText } from '@/utils/utilizationFee'

// Себестоимость поставки (17.10): после выпуска ДТ, в том числе по выполненной поставке. Наши данные — ТиН из ДТ,
// услуги AQNIET, СВХ; свои — сертификаты и транспорт — клиент вводит сам. Утильсбор (оператору РОП, не в гр. 47) — только
// если в ДТ есть ТС под утильсбором: расчёт по сверенной ставке или сумма, которую клиент указал сам (она важнее).
// Итог неполный — пишем, чего не хватает.
// Excel — по этой поставке (по всем — в «Моих поставках»).
const props = defineProps<{ caseId: string; status: number; caseNumber: string; stamp?: string | null }>()
const { t, locale } = useI18n()
const uid = useId()

const cost = ref<ShipmentCostDto | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
let seq = 0
const load = async () => {
  if (!costAvailable(props.status)) return
  const my = ++seq
  if (!cost.value) state.value = 'loading'
  try {
    const v = await shipmentCostApi.get(props.caseId)
    if (my !== seq) return
    cost.value = v
    state.value = 'ready'
  } catch {
    if (my === seq && !cost.value) state.value = 'error'
  }
}
// Перечитываем при смене поставки, статуса или карточки (выставили счёт СВХ, записали гр. В).
watch(() => [props.caseId, props.status, props.stamp] as const, ([id], old) => {
  if (old && old[0] !== id) cost.value = null
  void load()
}, { immediate: true })

const money = (n: number) => formatMoneyIn(locale.value, n)
const declSource = (s: 'B' | '47') => t(`shipmentCost.source.${s === 'B' ? 'b' : 'g47'}`)

interface Row { key: ShipmentCostPart; label: string; value: number | null; hint: string; empty: string }
const rows = computed<Row[]>(() => {
  const c = cost.value
  if (!c) return []
  const invoices = c.brokerInvoices.map((i) => `№ ${i.number}/${i.year}`).join(', ')
  return [
    { key: 'customs', label: t('shipmentCost.customs'), value: c.customsKzt, hint: t('shipmentCost.customsHint'), empty: t('shipmentCost.customsEmpty') },
    { key: 'broker', label: t('shipmentCost.broker'), value: c.brokerKzt, hint: invoices, empty: t('shipmentCost.brokerEmpty') },
    { key: 'svh', label: t('shipmentCost.svh'), value: c.svhKzt, hint: c.svhInvoiceNumber ? `№ ${c.svhInvoiceNumber}` : '', empty: t('shipmentCost.svhEmpty') },
    { key: 'certificates', label: t('shipmentCost.certificates'), value: c.certificatesKzt, hint: t('shipmentCost.yours'), empty: t('shipmentCost.notEntered') },
    ...(hasFreight.value ? [{
      key: 'freight' as const, label: t('shipmentCost.freight'), value: c.freightKzt ?? null,
      hint: t('shipmentCost.freightHint'), empty: t('shipmentCost.notEntered'),
    }] : []),
    {
      key: 'transport', label: t(hasFreight.value ? 'shipmentCost.otherTransport' : 'shipmentCost.transport'), value: c.transportKzt,
      hint: t('shipmentCost.yours'), empty: t(hasFreight.value ? 'shipmentCost.otherTransportEmpty' : 'shipmentCost.notEntered'),
    },
    ...(hasUtilization.value ? [{
      key: 'utilization' as const, label: t('shipmentCost.utilization'), value: c.utilizationKzt ?? null,
      hint: c.utilizationSource === 'input' ? t('shipmentCost.utilizationInput') : t('shipmentCost.utilizationCalc'),
      empty: t('shipmentCost.utilizationEmpty'),
    }] : []),
  ]
})
const hasFreight = computed(() => !!cost.value?.freightInvoices?.length)
const freightLines = computed(() => cost.value?.freightInvoices ?? [])
const hasUtilization = computed(() => !!cost.value?.utilizationLines?.length || cost.value?.utilizationInputKzt != null)
const utilLines = computed(() => cost.value?.utilizationLines ?? [])
const utilLineLabel = (l: { declarationNumber: string; goodsNumber: number; vin: string | null }) =>
  [t('shipmentCost.dt', { n: l.declarationNumber || '—' }), t('shipmentCost.goodsN', { n: l.goodsNumber }), l.vin].filter(Boolean).join(' · ')
const missingText = computed(() =>
  (cost.value?.missing ?? []).map((m) => t(`shipmentCost.part.${m}`)).join(', '))

// ---- Ввод клиента ----
const editOpen = ref(false)
const form = ref({ certificates: null as number | null, transport: null as number | null, utilization: null as number | null, note: '' })
const saving = ref(false)
const openEdit = () => {
  form.value = {
    certificates: cost.value?.certificatesKzt ?? null, transport: cost.value?.transportKzt ?? null,
    utilization: cost.value?.utilizationInputKzt ?? null, note: cost.value?.note ?? '',
  }
  editOpen.value = true
}
const save = async () => {
  if (saving.value) return
  saving.value = true
  try {
    cost.value = await shipmentCostApi.update(props.caseId, {
      certificatesKzt: form.value.certificates, transportKzt: form.value.transport, note: form.value.note.trim(),
      utilizationKzt: form.value.utilization,
    })
    editOpen.value = false
    message.success(t('shipmentCost.saved'))
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    saving.value = false
  }
}

const exporting = ref(false)
const exportXlsx = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const { blob, fileName } = await shipmentCostApi.xlsx(locale.value, props.caseId)
    saveBlob(blob, fileName)
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    exporting.value = false
  }
}

const titleId = `ship-cost-${uid}`
const card = 'rounded-panel border border-line px-[18px] py-4 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:px-0'
// Кнопки: sm на компьютере, на телефоне — во всю ширину и 44px.
const btn = 'max-sm:h-11 max-sm:w-full max-sm:text-sm'
</script>

<template>
  <section v-if="costAvailable(status)" :aria-labelledby="titleId" :class="card" data-ship-cost>
    <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 :id="titleId" class="m-0 min-w-0 flex-1 text-[15px] leading-6 font-semibold text-ink">{{ t('shipmentCost.title') }}</h2>
      <div v-if="state === 'ready'" class="flex flex-wrap gap-2 max-sm:w-full max-sm:flex-col">
        <ZButton size="sm" :class="btn" data-cost-edit @click="openEdit">
          <template #icon><PhPencilSimple :size="15" aria-hidden="true" /></template>
          {{ t('shipmentCost.edit') }}
        </ZButton>
        <ZButton size="sm" :class="btn" :loading="exporting" data-cost-xlsx @click="exportXlsx">
          <template #icon><PhFileXls :size="15" aria-hidden="true" /></template>
          {{ t('shipmentCost.excel') }}
        </ZButton>
      </div>
    </div>

    <div v-if="state === 'loading'" class="flex flex-col gap-2" aria-busy="true">
      <ZSkeleton v-for="i in 4" :key="i" height="16px" />
    </div>
    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-x-3 gap-y-2" data-cost-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('shipmentCost.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-cost-retry @click="load">{{ t('home.retry') }}</ZButton>
    </div>
    <template v-else-if="cost">
      <p class="m-0 mb-2 text-sm text-ink-3">{{ t('shipmentCost.hint') }}</p>
      <dl class="m-0 flex flex-col">
        <div
          v-for="r in rows"
          :key="r.key"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line py-2"
          :data-cost-row="r.key"
        >
          <dt class="min-w-0 text-sm text-ink">
            {{ r.label }}
            <span v-if="r.value !== null && r.hint" class="block text-xs text-ink-3 [overflow-wrap:anywhere]">{{ r.hint }}</span>
          </dt>
          <dd :class="cn('m-0 text-right text-sm tabular-nums', r.value === null ? 'text-ink-3 italic' : 'text-ink-2')" data-cost-value>
            {{ r.value === null ? r.empty : money(r.value) }}
          </dd>
          <!-- ТиН — по каждой ДТ: уплачено (гр. В) или начислено (гр. 47). -->
          <ul v-if="r.key === 'customs' && cost.declarations.length > 1" role="list" class="col-span-2 m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
            <li
              v-for="d in cost.declarations"
              :key="d.declarationId"
              class="flex flex-wrap justify-between gap-x-3 text-xs text-ink-3"
              data-cost-decl
            >
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ t('shipmentCost.dt', { n: d.number || '—' }) }} · {{ declSource(d.source) }}</span>
              <span class="tabular-nums">{{ money(d.totalKzt) }}</span>
            </li>
          </ul>
          <p v-else-if="r.key === 'customs' && cost.declarations.length === 1" class="col-span-2 m-0 mt-0.5 text-xs text-ink-3" data-cost-decl>
            {{ declSource(cost.declarations[0]!.source) }}
          </p>
          <!-- Фрахт — по каждому счёту перевозчика: сумма в валюте и ≈ в тенге (нет курса — предупреждение). -->
          <ul v-if="r.key === 'freight' && freightLines.length" role="list" class="col-span-2 m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
            <li v-for="f in freightLines" :key="f.id" class="flex flex-wrap justify-between gap-x-3 text-xs text-ink-3" data-cost-freight-line>
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ t('shipmentCost.freightLine', { carrier: f.carrierName, n: f.number }) }}</span>
              <span class="tabular-nums">{{ f.currency === 'KZT' ? money(f.amount) : `${formatNumberIn(locale, f.amount, 2, 2)} ${f.currency}` }}<template v-if="f.currency !== 'KZT'"> · {{ f.amountKzt != null ? `≈ ${money(f.amountKzt)}` : t('shipmentCost.freightNoRate') }}</template></span>
            </li>
          </ul>
          <!-- Утильсбор — по каждому ТС/товару: сумма, оценка «не сверено» или чего не хватает. -->
          <ul v-if="r.key === 'utilization' && utilLines.length" role="list" class="col-span-2 m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
            <li
              v-for="(l, i) in utilLines"
              :key="i"
              class="flex flex-wrap justify-between gap-x-3 text-xs text-ink-3"
              :data-cost-util-line="l.fee.status"
            >
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ utilLineLabel(l) }}</span>
              <span :class="cn('[overflow-wrap:anywhere]', l.fee.status === 'ok' && 'tabular-nums')">{{ utilizationStatusText(t, l.fee, money) }}</span>
            </li>
          </ul>
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 pt-2.5" data-cost-row="total">
          <dt class="text-[15px] font-semibold text-ink">{{ t('shipmentCost.total') }}</dt>
          <dd class="m-0 text-right text-[15px] font-semibold tabular-nums text-ink" data-cost-total>{{ money(cost.totalKzt) }}</dd>
        </div>
      </dl>
      <p v-if="cost.missing.length" class="m-0 mt-1.5 text-xs text-ink-3" data-cost-missing>{{ t('shipmentCost.incomplete', { list: missingText }) }}</p>
      <p v-if="cost.note" class="m-0 mt-1.5 text-xs text-ink-3 [overflow-wrap:anywhere]" data-cost-note>{{ t('shipmentCost.noteShown', { note: cost.note }) }}</p>
    </template>

    <ZModal
      v-model:open="editOpen"
      :title="t('shipmentCost.editTitle')"
      :ok-text="t('shipmentCost.save')"
      :cancel-text="t('shipmentCost.cancel')"
      :confirm-loading="saving"
      :width="480"
      data-cost-modal
      @ok="save"
    >
      <template #description>{{ t('shipmentCost.editHint', { n: caseNumber }) }}</template>
      <div class="flex flex-col gap-4">
        <ZField :label="t('shipmentCost.certificatesLabel')">
          <ZNumber v-model:value="form.certificates" :min="0" :max="1e12" :precision="2" class="tabular-nums" data-cost-certificates />
        </ZField>
        <ZField :label="t(hasFreight ? 'shipmentCost.otherTransportLabel' : 'shipmentCost.transportLabel')" :help="hasFreight ? t('shipmentCost.otherTransportHelp') : undefined">
          <ZNumber v-model:value="form.transport" :min="0" :max="1e12" :precision="2" class="tabular-nums" data-cost-transport />
        </ZField>
        <ZField v-if="hasUtilization" :label="t('shipmentCost.utilizationLabel')" :help="t('shipmentCost.utilizationHelp')">
          <ZNumber v-model:value="form.utilization" :min="0" :max="1e12" :precision="2" class="tabular-nums" data-cost-utilization />
        </ZField>
        <ZField :label="t('shipmentCost.noteLabel')">
          <ZTextarea v-model:value="form.note" :rows="2" :maxlength="COST_NOTE_MAX" :placeholder="t('shipmentCost.notePh')" data-cost-note-input />
        </ZField>
      </div>
    </ZModal>
  </section>
</template>
