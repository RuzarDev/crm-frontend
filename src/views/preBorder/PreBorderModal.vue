<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import type { ZOption } from '@/ui/options'
import { carriersApi, type Carrier } from '@/api/carriers'
import { preBorderApi, type PreBorder, type PreBorderFields, type PreBorderPayment } from '@/api/preBorder'
import { fieldErrors as serverFieldErrors } from '@/api/nationalLists'
import { formatNumberIn } from '@/ui/number'
import { message } from '@/ui/message'
import { dayMonth, emptyPreBorderFields, preBorderErrors, preBorderFieldsOf } from '@/utils/preBorder'

// Правка поставки до границы одним окном: оплата поставщику (оплаты внешнеторговых контрактов клиента или «после
// поставки»), погрузка (дата, город, склад, пломбы), в пути (перевозчик, номера транспорта по виду, контейнер,
// ожидаемая дата на границе). Тягач/прицеп/вагон — поля заявки: их же видят КПП и ДТ.
const props = defineProps<{ open: boolean; caseId: string; data: PreBorder | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [dto: PreBorder] }>()
const { t, locale } = useI18n()

const fields = ref<PreBorderFields>(emptyPreBorderFields())
const touched = ref(false)
const saving = ref(false)
const serverErrors = ref<Record<string, string>>({})
const carriers = shallowRef<Carrier[]>([])

watch(() => props.open, (v) => {
  if (!v) return
  fields.value = props.data ? preBorderFieldsOf(props.data) : emptyPreBorderFields()
  touched.value = false
  serverErrors.value = {}
  void carriersApi.caseCarriers(props.caseId).then((r) => { carriers.value = r }).catch(() => { carriers.value = [] })
}, { immediate: true })

// Вид транспорта заявки: 0 — ЖД, 1 — авто, 2 — авиа, 3 — море. Контейнер — у любого.
const mode = computed(() => props.data?.transportMode ?? 1)

const allPayments = computed<PreBorderPayment[]>(() => [...(props.data?.payments ?? []), ...(props.data?.availablePayments ?? [])])
const paymentLabel = (p: PreBorderPayment) =>
  `${p.contractNumber} · ${dayMonth(p.paidOn)} · ${formatNumberIn(locale.value, p.amount, 2, 2)} ${p.currency}`
const togglePayment = (id: string, on: boolean) => {
  const set = new Set(fields.value.paymentIds)
  if (on) set.add(id)
  else set.delete(id)
  fields.value.paymentIds = [...set]
}

// Уже выбранный перевозчик — в списке, даже если ушёл в архив (сервер его оставит).
const carrierOptions = computed<ZOption[]>(() => {
  const list: ZOption[] = carriers.value.map((c) => ({ value: c.id, label: c.name }))
  const d = props.data
  if (d?.carrierId && !carriers.value.some((c) => c.id === d.carrierId))
    list.unshift({ value: d.carrierId, label: `${d.carrierName ?? '—'}${d.carrierArchived ? ` (${t('preBorder.archived')})` : ''}` })
  return list
})

const localErrors = computed(() => (touched.value ? preBorderErrors(fields.value) : {}))
const err = (f: keyof PreBorderFields): string | undefined => {
  const local = localErrors.value[f]
  return local ? t(local) : serverErrors.value[f]
}

const save = async () => {
  if (saving.value) return
  touched.value = true
  serverErrors.value = {}
  if (Object.keys(preBorderErrors(fields.value)).length) return
  saving.value = true
  try {
    const dto = await preBorderApi.save(props.caseId, fields.value)
    emit('saved', dto)
    emit('update:open', false)
    message.success(t('preBorder.saved'))
  } catch (e) {
    serverErrors.value = serverFieldErrors(e)
    const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
    if (!Object.keys(serverErrors.value).length && res?.status === 400) message.error(res.data?.error || t('preBorder.saveError'))
  } finally {
    saving.value = false
  }
}

const h3 = 'm-0 text-[13px] font-semibold text-ink-2 sm:col-span-2'
</script>

<template>
  <ZModal
    :open="open"
    :title="t('preBorder.editTitle')"
    :ok-text="t('preBorder.save')"
    :cancel-text="t('preBorder.cancel')"
    :confirm-loading="saving"
    :width="620"
    data-pre-border-modal
    @update:open="emit('update:open', $event)"
    @ok="save"
  >
    <template #description>{{ t('preBorder.editHint') }}</template>
    <form class="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2" novalidate @submit.prevent="save">
      <!-- 1. Оплата поставщику -->
      <h3 :class="h3">{{ t('preBorder.sub.pay') }}</h3>
      <div class="flex flex-col gap-1 sm:col-span-2" data-pb-payments>
        <p v-if="!allPayments.length" class="m-0 text-sm text-ink-3">{{ t('preBorder.noPayments') }}</p>
        <ZCheckbox
          v-for="p in allPayments"
          :key="p.id"
          :checked="fields.paymentIds.includes(p.id)"
          :disabled="fields.supplierPaymentDeferred"
          class="flex min-h-11 items-center gap-2 text-sm text-ink sm:min-h-8"
          :data-pb-payment="p.id"
          @update:checked="togglePayment(p.id, $event)"
        >
          <span class="[overflow-wrap:anywhere]">{{ paymentLabel(p) }}<span class="text-ink-3"> · {{ p.supplierName }}</span></span>
        </ZCheckbox>
        <p v-if="err('paymentIds')" class="m-0 text-xs text-tone-danger-fg">{{ err('paymentIds') }}</p>
        <ZCheckbox v-model:checked="fields.supplierPaymentDeferred" class="flex min-h-11 items-center gap-2 text-sm text-ink-2 sm:min-h-8" data-pb-deferred>
          {{ t('preBorder.deferred') }}
        </ZCheckbox>
        <p class="m-0 text-xs text-ink-3">{{ t('preBorder.paymentsHint') }}</p>
      </div>

      <!-- 2. Погрузка -->
      <h3 :class="h3">{{ t('preBorder.sub.load') }}</h3>
      <ZField :label="t('preBorder.loadingDate')" :error="err('loadingDate')">
        <ZDate v-model:value="fields.loadingDate" allow-clear class="max-sm:h-11" data-pb-loading-date />
      </ZField>
      <ZField :label="t('preBorder.loadingCity')" :error="err('loadingCity')">
        <ZInput v-model:value="fields.loadingCity" :maxlength="300" class="max-sm:h-11" data-pb-loading-city />
      </ZField>
      <ZField :label="t('preBorder.loadingWarehouse')" :error="err('loadingWarehouse')" class="sm:col-span-2">
        <ZInput v-model:value="fields.loadingWarehouse" :maxlength="300" class="max-sm:h-11" data-pb-loading-warehouse />
      </ZField>
      <ZField :label="t('preBorder.seals')" :help="t('preBorder.sealsHelp')" :error="err('sealNumbers')" class="sm:col-span-2">
        <ZTextarea v-model:value="fields.sealNumbers" :rows="2" :maxlength="1000" data-pb-seals />
      </ZField>

      <!-- 3. В пути -->
      <h3 :class="h3">{{ t('preBorder.sub.transit') }}</h3>
      <ZField :label="t('preBorder.carrier')" :help="carriers.length ? undefined : t('preBorder.noCarriers')" :error="err('carrierId')" class="sm:col-span-2">
        <ZSelect
          :value="fields.carrierId"
          :options="carrierOptions"
          allow-clear
          show-search
          :placeholder="t('preBorder.carrierPh')"
          class="max-sm:h-11"
          data-pb-carrier
          @update:value="fields.carrierId = ($event as string | null) ?? null"
        />
      </ZField>
      <template v-if="mode === 1">
        <ZField :label="t('preBorder.vehicle')" :error="err('vehicleNumber')">
          <ZInput v-model:value="fields.vehicleNumber" mono :maxlength="50" class="max-sm:h-11" data-pb-vehicle />
        </ZField>
        <ZField :label="t('preBorder.trailer')" :error="err('trailerNumber')">
          <ZInput v-model:value="fields.trailerNumber" mono :maxlength="50" class="max-sm:h-11" data-pb-trailer />
        </ZField>
      </template>
      <ZField v-if="mode === 0" :label="t('preBorder.wagon')" :error="err('wagonNumber')">
        <ZInput v-model:value="fields.wagonNumber" mono :maxlength="50" class="max-sm:h-11" data-pb-wagon />
      </ZField>
      <ZField :label="t('preBorder.container')" :error="err('containerNumber')">
        <ZInput v-model:value="fields.containerNumber" mono :maxlength="50" class="max-sm:h-11" data-pb-container />
      </ZField>
      <ZField :label="t('preBorder.eta')" :error="err('expectedBorderDate')">
        <ZDate v-model:value="fields.expectedBorderDate" :min="fields.loadingDate" allow-clear class="max-sm:h-11" data-pb-eta />
      </ZField>
    </form>
  </ZModal>
</template>
