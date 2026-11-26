<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { AutoDriver, AutoVehicle, AutoVehicleRole } from '@/api/autoTransit'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import type { ZOption } from '@/ui/options'
import { useRecordRefs } from '@/views/broker/transit/record/sections/refs'
import SectionAddButton from '@/views/broker/transit/record/sections/SectionAddButton.vue'
import { boxCtl, ctl, grid, ph, str } from '@/views/broker/transit/record/sections/ui'
import { DEFAULT_TYPE, VEHICLE_PAIRS, applyVehiclePair, currentVehiclePair, firstHitch, newVehicle, removeVehicle, type AutoPart, type VehiclePair } from './tdModel'
import { upperCode } from '../truck/truckView'

// «Машины и водитель» ПИ / ТД (очередь 3, спека 2026-11-25, 4.3) — вместо ЖД-разделов «Транспорт» и «Пломбы».
// Машины: тягач / прицеп / грузовик, тип по классификатору 2024 (связка сцепки выбирается кнопкой, одиночный грузовик 303), госномер, страна (две буквы),
// VIN (по умолчанию «-»), у прицепа — к какому тягачу. Водитель: ФИО, страна, вид и номер документа, личный номер.
// Правит auto на месте (useTd держит снимок и dirty). Данные водителя — персональные: не логируем.
const props = defineProps<{ auto: AutoPart; readonly: boolean }>()
const { t } = useI18n()
const V = 'broker.autoTransit.td.vehicles'
const tr = (key: string, p?: Record<string, unknown>) => (p ? t(`${V}.${key}`, p) : t(`${V}.${key}`))
const titleId = `sec-vehicles-title-${useId()}`

const refs = useRecordRefs()
void refs.ensureClassifiers(['2024', 'id-doc-types'])
const typeOptions = computed(() => refs.classifierOptions('2024'))
const docKindOptions = computed(() => refs.classifierOptions('id-doc-types'))
const countries = useCountryAlpha2Options()

const ROLES: AutoVehicleRole[] = ['tractor', 'trailer', 'truck']
const roleOptions = computed<ZOption[]>(() => ROLES.map((r) => ({ value: r, label: tr(`role.${r}`) })))
/** Тягачи списка — варианты «к какому тягачу» у прицепа. */
const headOptions = computed<ZOption[]>(() => props.auto.vehicles.flatMap((v, i) => (v.role === 'tractor'
  ? [{ value: String(i), label: tr('headOption', { n: i + 1, plate: v.regNumber?.trim() || '—' }) }]
  : [])))

/** Связка типов — только у сцепки: есть прицеп и головное ТС. */
const showPairs = computed(() => firstHitch(props.auto.vehicles) !== null)
const activePair = computed(() => currentVehiclePair(props.auto.vehicles))
const pickPair = (pair: VehiclePair) => {
  if (props.readonly) return
  applyVehiclePair(props.auto.vehicles, pair)
}

const add = (role: AutoVehicleRole) => {
  if (props.readonly) return
  props.auto.vehicles.push(newVehicle(role, props.auto.vehicles))
}
const remove = (index: number) => {
  if (props.readonly) return
  props.auto.vehicles.splice(0, props.auto.vehicles.length, ...removeVehicle(props.auto.vehicles, index))
}
/** Смена роли: тип по умолчанию прежней роли меняется на тип новой (303 есть только у одиночного грузовика); ссылка на тягач — только у прицепа. */
const setRole = (v: AutoVehicle, raw: unknown) => {
  const role = ROLES.includes(raw as AutoVehicleRole) ? (raw as AutoVehicleRole) : v.role
  if (role === v.role) return
  if (v.typeCode === DEFAULT_TYPE[v.role] || !v.typeCode) v.typeCode = DEFAULT_TYPE[role]
  if (role === 'trailer') {
    const head = props.auto.vehicles.findIndex((x) => x.role === 'tractor' && x !== v)
    v.headIndex = head >= 0 ? head : null
  } else v.headIndex = null
  v.role = role
}
const setHead = (v: AutoVehicle, raw: unknown) => {
  const n = raw == null || raw === '' ? null : Number(raw)
  v.headIndex = n != null && Number.isInteger(n) ? n : null
}
const setDriver = <K extends keyof AutoDriver>(k: K, v: unknown) => { props.auto.driver[k] = str(v) }
const setCountry = (target: { countryCode: string | null }, v: unknown) => {
  const code = upperCode(String(v ?? ''), 2)
  target.countryCode = code || null
}

const deleteBtn = 'ml-auto inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
const badge = 'inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-field bg-surface px-1.5 text-xs font-semibold text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
const groupTitle = 'm-0 text-[13px] leading-5 font-semibold text-ink-2'
</script>

<template>
  <section
    id="sec-vehicles"
    :aria-labelledby="titleId"
    data-record-section="vehicles"
    class="flex min-w-0 scroll-mt-4 flex-col gap-3.5 border-t border-line pt-5 first:border-t-0 first:pt-0"
  >
    <div class="flex flex-wrap items-center gap-2.5">
      <h2 :id="titleId" class="m-0 text-base leading-6 font-semibold text-ink">{{ t('broker.transitRecord.sections.vehicles') }}</h2>
      <span class="rounded-pill bg-sunken px-1.5 text-xs font-normal text-ink-2 tabular-nums" data-section-count>{{ auto.vehicles.length }}</span>
      <div v-if="!readonly" class="ml-auto flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:[&_button]:min-h-11" data-section-actions>
        <SectionAddButton v-for="r in ROLES" :key="r" :label="tr(`add.${r}`)" :data-vehicle-add="r" @click="add(r)" />
      </div>
    </div>

    <div role="group" aria-labelledby="td-vehicles-g-list" class="flex min-w-0 flex-col gap-3" data-vehicles-list>
      <h3 id="td-vehicles-g-list" :class="groupTitle">{{ tr('groupVehicles') }}</h3>
      <div v-if="showPairs" role="group" :aria-label="tr('pairLabel')" class="flex min-w-0 flex-col gap-1.5" data-vehicle-pairs>
        <span class="text-xs leading-4 text-muted">{{ tr('pairLabel') }}</span>
        <div class="flex min-w-0 flex-wrap gap-1.5">
          <button
            v-for="p in VEHICLE_PAIRS"
            :key="p.key"
            type="button"
            :disabled="readonly"
            :aria-pressed="activePair?.key === p.key"
            :data-vehicle-pair="p.key"
            :data-active="activePair?.key === p.key ? 'true' : undefined"
            class="inline-flex min-h-8 max-w-full cursor-pointer items-center rounded-field border-0 bg-surface px-2.5 text-left text-[13px] leading-5 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-hidden transition-colors hover:bg-sunken focus-visible:shadow-focus disabled:cursor-default disabled:opacity-60 aria-pressed:bg-sunken aria-pressed:font-semibold aria-pressed:shadow-[inset_0_0_0_2px_var(--color-ink)] max-sm:min-h-11"
            @click="pickPair(p)"
          >{{ tr(`pair.${p.key}`, { head: p.head, trailer: p.trailer }) }}</button>
        </div>
      </div>
      <p v-if="!auto.vehicles.length" class="m-0 text-sm text-ink-3" data-vehicles-empty>{{ tr('empty') }}</p>
      <ul v-else role="list" class="m-0 flex list-none flex-col gap-2.5 p-0">
        <li
          v-for="(v, i) in auto.vehicles"
          :key="i"
          class="flex min-w-0 flex-col gap-3 rounded-row border border-line bg-surface p-3.5"
          :data-vehicle="v.role"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <span :class="badge">{{ i + 1 }}</span>
            <span class="min-w-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]" data-vehicle-title>{{ tr(`role.${v.role}`) }}<template v-if="v.regNumber?.trim()"> · <span class="font-mono font-normal">{{ v.regNumber }}</span></template></span>
            <button
              v-if="!readonly"
              type="button"
              :class="deleteBtn"
              :aria-label="tr('remove', { n: i + 1 })"
              data-vehicle-delete
              @click="remove(i)"
            ><PhX :size="16" aria-hidden="true" /></button>
          </div>
          <div :class="grid">
            <ZField :label="tr('role.label')">
              <ZSelect :value="v.role" :options="roleOptions" :disabled="readonly" :class="boxCtl" data-f="role" @update:value="setRole(v, $event)" />
            </ZField>
            <ZField :label="tr('typeCode')" :extra="readonly || v.typeCode ? undefined : tr('typeHint')">
              <ZSelect :value="v.typeCode" :options="typeOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="typeCode" @update:value="v.typeCode = str($event)" />
            </ZField>
            <ZField :label="tr('regNumber')">
              <ZInput :value="v.regNumber" mono :maxlength="32" :disabled="readonly" :class="ctl" data-f="regNumber" @update:value="v.regNumber = str($event)" />
            </ZField>
            <ZField :label="tr('countryCode')">
              <ZCombobox :value="v.countryCode" :options="countries" mono allow-clear :disabled="readonly" :class="boxCtl" data-f="countryCode" @update:value="setCountry(v, $event)" />
            </ZField>
            <ZField :label="tr('vin')">
              <ZInput :value="v.vin" mono :maxlength="32" :disabled="readonly" :class="ctl" data-f="vin" @update:value="v.vin = str($event)" />
            </ZField>
            <ZField v-if="v.role === 'trailer'" :label="tr('head')">
              <ZSelect :value="v.headIndex == null ? null : String(v.headIndex)" :options="headOptions" allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('headNone'))" :class="boxCtl" data-f="headIndex" @update:value="setHead(v, $event)" />
            </ZField>
          </div>
        </li>
      </ul>
    </div>

    <div role="group" aria-labelledby="td-vehicles-g-driver" class="flex min-w-0 flex-col gap-3" data-vehicles-driver>
      <h3 id="td-vehicles-g-driver" :class="groupTitle">{{ tr('groupDriver') }}</h3>
      <div :class="grid">
        <ZField :label="tr('driver.fullName')" required>
          <ZInput :value="auto.driver.fullName" :maxlength="300" :disabled="readonly" :class="ctl" data-f="driver.fullName" @update:value="setDriver('fullName', $event)" />
        </ZField>
        <ZField :label="tr('driver.countryCode')">
          <ZCombobox :value="auto.driver.countryCode" :options="countries" mono allow-clear :disabled="readonly" :class="boxCtl" data-f="driver.countryCode" @update:value="setCountry(auto.driver, $event)" />
        </ZField>
        <ZField :label="tr('driver.docKindCode')">
          <ZSelect :value="auto.driver.docKindCode" :options="docKindOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="driver.docKindCode" @update:value="setDriver('docKindCode', $event)" />
        </ZField>
        <ZField :label="tr('driver.docNumber')" required>
          <ZInput :value="auto.driver.docNumber" mono :maxlength="50" :disabled="readonly" :class="ctl" data-f="driver.docNumber" @update:value="setDriver('docNumber', $event)" />
        </ZField>
        <ZField :label="tr('driver.personalNumber')">
          <ZInput :value="auto.driver.personalNumber" mono :maxlength="50" :disabled="readonly" :class="ctl" data-f="driver.personalNumber" @update:value="setDriver('personalNumber', $event)" />
        </ZField>
      </div>
    </div>
  </section>
</template>
