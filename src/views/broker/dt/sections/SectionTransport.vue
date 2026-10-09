<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCopy } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ZOption } from '@/ui/options'
import DtGraphHelp from '../DtGraphHelp.vue'
import { dedupeOptions, withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'
import TransportMeansList from './TransportMeansList.vue'

// Транспорт: вид (гр. 25, 26) и контейнер (гр. 19), ТС при прибытии (гр. 18), ТС на границе (гр. 21).
// Правила (как в прежнем разделе): голова/прицеп только у видов 30/31/32; вид гр. 18 всегда берётся из гр. 26, а без неё
// из гр. 25 (так же считает сервер); у ЖД (20) гр. 21 не заполняется — вагоны идут в гр. 18; «Скопировать головы» переносит
// головы гр. 18 в гр. 21 (без прицепов и привязок), а вид и страну ставит, только если они пусты.
// Страна регистрации ТС — одна на графу (в XML это RegistrationNationalityCode и страна каждого номера), поэтому она
// стоит над списком с номером графы, а не в каждой строке.
const props = defineProps<{ form: DtFormState; readonly: boolean }>()
const { t } = useI18n()
const classifiers = useClassifiersStore()
const countries = useCountryAlpha2Options()

// Массивы формы всегда заполнены (buildForm/emptyDtForm); `?? []` — только для типов.
const arrivalRows = computed(() => props.form.arrivalTransportNumbers ?? [])
const borderRows = computed(() => props.form.borderTransportNumbers ?? [])

const ROAD = ['30', '31', '32']
const isRoad = (code: string | null | undefined) => ROAD.includes((code ?? '').trim())
const isRail = (code: string | null | undefined) => (code ?? '').trim() === '20'

const arrivalMode = computed(() => props.form.inlandTransportModeCode || props.form.borderTransportModeCode || props.form.arrivalTransportModeCode)
const borderMode = computed(() => props.form.borderTransportModeCode)
const rail = computed(() => isRail(borderMode.value))

const modeOptions = computed(() => dedupeOptions(classifiers.options('2004')))
const typeOptions = computed(() => dedupeOptions(classifiers.options('2024')))
const markOptions = computed<ZOption[]>(() => classifiers.options('vehicle-marks'))
const border = computed(() => withCurrent(modeOptions.value, props.form.borderTransportModeCode))
const inland = computed(() => withCurrent(modeOptions.value, props.form.inlandTransportModeCode))
const arrivalCountry = computed(() => withCurrent(countries.value, props.form.arrivalTransportNationality))
const borderCountry = computed(() => withCurrent(countries.value, props.form.borderTransportNationality))

const warn = (unknown: boolean, value: string | null | undefined, key = 'broker.dt.transport.notInList') =>
  unknown ? { validateStatus: 'warning' as const, help: t(key, { value: value ?? '' }) } : {}
const code = (v: unknown): string | null => (v == null || v === '' ? null : String(v))

// Вид гр. 18 — зеркало гр. 26 / гр. 25 (своего поля нет); сервер пересчитает его сам, здесь — чтобы форма и подписи не расходились.
const syncArrivalMode = () => {
  props.form.arrivalTransportModeCode = props.form.inlandTransportModeCode || props.form.borderTransportModeCode || props.form.arrivalTransportModeCode
}
const onBorderMode = (v: unknown) => { props.form.borderTransportModeCode = code(v) ?? ''; syncArrivalMode() }
const onInlandMode = (v: unknown) => { props.form.inlandTransportModeCode = code(v); syncArrivalMode() }
const onContainer = (v: boolean) => { props.form.containerIndicator = v }
const onArrivalCountry = (v: unknown) => { props.form.arrivalTransportNationality = code(v) ?? '' }
const onBorderCountry = (v: unknown) => { props.form.borderTransportNationality = code(v) ?? '' }

const canCopyHeads = computed(() => !props.readonly && !rail.value && arrivalRows.value.some((m) => !m.isTrailer))
const copyHeads = () => {
  props.form.borderTransportNumbers = arrivalRows.value.filter((m) => !m.isTrailer).map((m) => ({ ...m, headNumber: null }))
  if (!props.form.borderTransportModeCode) props.form.borderTransportModeCode = arrivalMode.value || ''
  if (!props.form.borderTransportNationality) props.form.borderTransportNationality = props.form.arrivalTransportNationality
  syncArrivalMode()
}

const h2 = 'm-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink'
const graphTag = 'font-mono text-xs font-normal text-muted'
</script>

<template>
  <section class="@container flex flex-col gap-6" data-dt-transport>
    <div class="flex flex-col gap-4" data-transport-modes>
      <h2 :class="h2">
        {{ t('broker.dt.transport.modesTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '19, 25, 26' }) }}</span>
      </h2>
      <div class="grid grid-cols-1 items-end gap-x-4 gap-y-4 @md:grid-cols-2 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <ZField graph="25" data-graph="25" v-bind="warn(border.unknown, form.borderTransportModeCode)">
          <template #label>{{ t('broker.dt.transport.borderMode') }}<DtGraphHelp graph="25" /></template>
          <ZSelect :value="form.borderTransportModeCode || null" :options="border.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.transport.select')" popup-width="320px" @update:value="onBorderMode" />
        </ZField>
        <ZField graph="26" data-graph="26" v-bind="warn(inland.unknown, form.inlandTransportModeCode)">
          <template #label>{{ t('broker.dt.transport.inlandMode') }}<DtGraphHelp graph="26" /></template>
          <ZSelect :value="form.inlandTransportModeCode || null" :options="inland.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.transport.select')" popup-width="320px" @update:value="onInlandMode" />
        </ZField>
        <div class="flex min-h-11 items-center gap-1" data-graph="19">
          <ZSwitch :checked="!!form.containerIndicator" :disabled="readonly" @update:checked="onContainer">{{ t('broker.dt.transport.container') }}</ZSwitch>
          <DtGraphHelp graph="19" />
        </div>
      </div>
      <p class="m-0 text-xs text-muted">{{ t('broker.dt.transport.arrivalModeHint') }}</p>
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-transport-arrival>
      <h2 :class="h2">
        {{ t('broker.dt.transport.arrivalTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '18' }) }}</span>
        <DtGraphHelp graph="18" />
      </h2>
      <ZField graph="18" data-graph="18" class="max-w-xs" v-bind="warn(arrivalCountry.unknown, form.arrivalTransportNationality, 'broker.dt.transport.countryNotInList')">
        <template #label>{{ t('broker.dt.transport.country') }}</template>
        <ZSelect :value="form.arrivalTransportNationality || null" :options="arrivalCountry.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.transport.selectCountry')" @update:value="onArrivalCountry" />
      </ZField>
      <TransportMeansList
        graph="18"
        :rows="arrivalRows"
        :road="isRoad(arrivalMode)"
        :readonly="readonly"
        :type-options="typeOptions"
        :mark-options="markOptions"
      />
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-transport-border>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 :class="h2">
          {{ t('broker.dt.transport.borderTitle') }}
          <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '21' }) }}</span>
          <DtGraphHelp graph="21" />
        </h2>
        <ZButton v-if="canCopyHeads" class="max-sm:h-11" data-copy-heads @click="copyHeads">
          <PhCopy :size="16" aria-hidden="true" />{{ t('broker.dt.transport.copyHeads') }}
        </ZButton>
      </div>
      <template v-if="rail">
        <p class="m-0 rounded-row bg-sunken px-3 py-2.5 text-sm text-ink-2" data-rail-hint data-graph="21">{{ t('broker.dt.transport.railHint') }}</p>
        <!-- Старые данные: вагоны, внесённые в гр. 21 до перехода на ЖД, видны, чтобы их можно было убрать. -->
        <template v-if="borderRows.length">
          <p class="m-0 text-xs text-muted" data-rail-leftover>{{ t('broker.dt.transport.railLeftover') }}</p>
          <TransportMeansList
            graph="21"
            :rows="borderRows"
            :road="false"
            :readonly="readonly"
            :type-options="typeOptions"
            :mark-options="markOptions"
            :hide-add="true"
          />
        </template>
      </template>
      <template v-else>
        <ZField graph="21" data-graph="21" class="max-w-xs" v-bind="warn(borderCountry.unknown, form.borderTransportNationality, 'broker.dt.transport.countryNotInList')">
          <template #label>{{ t('broker.dt.transport.country') }}</template>
          <ZSelect :value="form.borderTransportNationality || null" :options="borderCountry.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.transport.selectCountry')" @update:value="onBorderCountry" />
        </ZField>
        <TransportMeansList
          graph="21"
          :rows="borderRows"
          :road="isRoad(borderMode)"
          :readonly="readonly"
          :type-options="typeOptions"
          :mark-options="markOptions"
        />
        <p class="m-0 text-xs text-muted">{{ t('broker.dt.transport.borderHint') }}</p>
      </template>
    </div>
  </section>
</template>
