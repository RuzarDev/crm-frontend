<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { TruckCard, TruckFields } from '@/api/autoTransit'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import type { ActionResult } from './useTruck'
import { diffPatch, upperCode } from './truckView'

// «Изменить данные машины»: номера тягача и прицепа со странами, водитель, перевозчик, пост, номер этапа 2, заезд,
// ожидаемый въезд (очередь 3: за 2 часа до него неподанная ПИ — срочная).
// Уходят только изменённые поля; очищенное — null.
const props = defineProps<{ open: boolean; card: TruckCard | null; save: (patch: TruckFields) => Promise<ActionResult> }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const F = 'broker.autoTransit.truck.fields'
const countries = useCountryAlpha2Options()

type Draft = {
  plate: string; plateCountry: string; trailerPlate: string; trailerCountry: string; driverName: string; driverDoc: string
  carrierName: string; carrierCountry: string; carrierRegNumber: string; customsPostCode: string; stageNumber: string
  arrivedDate: string | null; arrivedTime: string
  entryDate: string | null; entryTime: string
}
const pad = (n: number) => String(n).padStart(2, '0')
/** UTC → местные дата YYYY-MM-DD и время ЧЧ:ММ; пусто — null и ''. */
const local = (iso: string | null | undefined): { date: string | null; time: string } => {
  const d = iso ? new Date(iso) : null
  if (!d || !Number.isFinite(d.getTime())) return { date: null, time: '' }
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
const fromCard = (c: TruckCard | null): Draft => {
  const at = c?.arrivedAtUtc ? new Date(c.arrivedAtUtc) : null
  const ok = at && Number.isFinite(at.getTime())
  const entry = local(c?.expectedEntryAtUtc)
  return {
    entryDate: entry.date, entryTime: entry.time,
    plate: c?.plate ?? '', plateCountry: c?.plateCountry ?? '', trailerPlate: c?.trailerPlate ?? '', trailerCountry: c?.trailerCountry ?? '',
    driverName: c?.driverName ?? '', driverDoc: c?.driverDoc ?? '', carrierName: c?.carrierName ?? '', carrierCountry: c?.carrierCountry ?? '',
    carrierRegNumber: c?.carrierRegNumber ?? '', customsPostCode: c?.customsPostCode ?? '', stageNumber: c?.stageNumber ?? '',
    arrivedDate: ok ? `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` : null,
    arrivedTime: ok ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '',
  }
}
const draft = reactive<Draft>(fromCard(null))
let initial: Draft = fromCard(null)
const errors = ref<Record<string, string>>({})
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  initial = fromCard(props.card)
  Object.assign(draft, initial)
  errors.value = {}
})

/** Местные дата и время → UTC; без даты — null. */
const toIso = (date: string | null, time: string): string | null => {
  if (!date) return null
  const [y, m, day] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  return new Date(y!, m! - 1, day!, hh || 0, mm || 0).toISOString()
}
const arrivedIso = (d: Draft): string | null => toIso(d.arrivedDate, d.arrivedTime)
const entryIso = (d: Draft): string | null => toIso(d.entryDate, d.entryTime)

const onOk = async () => {
  if (!draft.plate.trim()) { errors.value = { plate: t(`${F}.plateRequired`) }; return }
  const { arrivedDate: _d, arrivedTime: _t, entryDate: _ed, entryTime: _et, ...rest } = draft
  const { arrivedDate: _d0, arrivedTime: _t0, entryDate: _ed0, entryTime: _et0, ...rest0 } = initial
  const patch: TruckFields = diffPatch(rest0, rest) as TruckFields
  const a0 = arrivedIso(initial)
  const a1 = arrivedIso(draft)
  if (a0 !== a1) patch.arrivedAtUtc = a1
  const e0 = entryIso(initial)
  const e1 = entryIso(draft)
  if (e0 !== e1) patch.expectedEntryAtUtc = e1
  if (!Object.keys(patch).length) { emit('update:open', false); return }
  saving.value = true
  try {
    const res = await props.save(patch)
    if (res.ok) emit('update:open', false)
    else errors.value = res.fieldErrors
  } finally {
    saving.value = false
  }
}
const setCountry = (k: 'plateCountry' | 'trailerCountry' | 'carrierCountry', v: string) => { draft[k] = upperCode(v, 2) }
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.autoTransit.truck.editTitle')"
    :ok-text="t('broker.autoTransit.truck.save')"
    :confirm-loading="saving"
    :width="640"
    data-truck-edit-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ZField :label="t(`${F}.plate`)" required :error="errors.plate">
        <ZInput v-model:value="draft.plate" mono :maxlength="30" data-edit-plate />
      </ZField>
      <ZField :label="t(`${F}.plateCountry`)" :error="errors.plateCountry" :extra="t('broker.autoTransit.truck.countryHint')">
        <ZCombobox :value="draft.plateCountry" :options="countries" mono allow-clear @update:value="setCountry('plateCountry', $event)" />
      </ZField>
      <ZField :label="t(`${F}.trailerPlate`)" :error="errors.trailerPlate">
        <ZInput v-model:value="draft.trailerPlate" mono :maxlength="30" />
      </ZField>
      <ZField :label="t(`${F}.trailerCountry`)" :error="errors.trailerCountry">
        <ZCombobox :value="draft.trailerCountry" :options="countries" mono allow-clear @update:value="setCountry('trailerCountry', $event)" />
      </ZField>
      <ZField :label="t(`${F}.driverName`)" :error="errors.driverName">
        <ZInput v-model:value="draft.driverName" :maxlength="300" data-edit-driver />
      </ZField>
      <ZField :label="t(`${F}.driverDoc`)" :error="errors.driverDoc">
        <ZInput v-model:value="draft.driverDoc" :maxlength="300" />
      </ZField>
      <ZField :label="t(`${F}.carrierName`)" :error="errors.carrierName">
        <ZInput v-model:value="draft.carrierName" :maxlength="300" />
      </ZField>
      <ZField :label="t(`${F}.carrierCountry`)" :error="errors.carrierCountry">
        <ZCombobox :value="draft.carrierCountry" :options="countries" mono allow-clear @update:value="setCountry('carrierCountry', $event)" />
      </ZField>
      <ZField :label="t(`${F}.carrierRegNumber`)" :error="errors.carrierRegNumber">
        <ZInput v-model:value="draft.carrierRegNumber" mono :maxlength="50" />
      </ZField>
      <ZField :label="t(`${F}.customsPostCode`)" :error="errors.customsPostCode">
        <ZInput v-model:value="draft.customsPostCode" mono :maxlength="20" />
      </ZField>
      <ZField :label="t(`${F}.stageNumber`)" :error="errors.stageNumber">
        <ZInput v-model:value="draft.stageNumber" mono :maxlength="300" />
      </ZField>
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-2">
        <ZField :label="t(`${F}.arrivedDate`)" :error="errors.arrivedAtUtc">
          <ZDate v-model:value="draft.arrivedDate" allow-clear />
        </ZField>
        <ZField :label="t(`${F}.arrivedTime`)">
          <ZInput v-model:value="draft.arrivedTime" type="time" :disabled="!draft.arrivedDate" />
        </ZField>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-2">
        <ZField :label="t(`${F}.expectedEntryDate`)" :error="errors.expectedEntryAtUtc">
          <ZDate v-model:value="draft.entryDate" allow-clear data-edit-entry-date />
        </ZField>
        <ZField :label="t(`${F}.expectedEntryTime`)">
          <ZInput v-model:value="draft.entryTime" type="time" :disabled="!draft.entryDate" data-edit-entry-time />
        </ZField>
      </div>
    </div>
  </ZModal>
</template>
