<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import { warehouseRegistryApi, warehouseValue, type WarehouseOfficeSuggestion, type WarehouseRegistryItem } from '@/api/warehouseRegistry'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import { message } from '@/ui/message'
import type { ZOption } from '@/ui/options'
import { checkWarehouseNumber } from '@/utils/warehouseNumber'
import DtGraphHelp from '../DtGraphHelp.vue'
import { dedupeOptions, withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'
import GoodsLocationModal from './GoodsLocationModal.vue'

// Органы и место товаров: гр. 29 (пост на границе — один выбор заполняет код и название) и гр. 30 (место
// нахождения товаров): код места из классификатора (новый добавляется окном «Добавить в справочник»), номер СВХ /
// таможенного склада с поиском по реестрам КГД / КЕДЕН (поиск после паузы, устаревший ответ отбрасывается; ручной
// ввод остаётся — реестр стареет), проверка номера — предупреждение, не блокировка; страна места, таможенный орган
// места (из НСИ; несколько — выбор; пусто — пост подачи), станция и адрес, «Товар на транспортном средстве» (код 52).
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  postOptions: ZOption[]
}>()
const { t } = useI18n()
const classifiers = useClassifiersStore()
const countries = useCountryAlpha2Options()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.customs.${key}`, p ?? {})

const warn = (unknown: boolean, value: string | null | undefined) =>
  unknown ? { validateStatus: 'warning' as const, help: t('broker.dt.general.notInList', { value: value ?? '' }) } : {}
const str = (v: unknown): string => (v == null ? '' : String(v))

// ---- Гр. 29 ----
// Значение выбора — полная строка поста (borderCustomsOfficeName), код — ведущие цифры строки.
const postSelect = computed(() => props.postOptions.map((o) => ({ value: o.label, label: o.label })))
const border = computed(() => withCurrent(postSelect.value, props.form.borderCustomsOfficeName))
const onBorder = (v: unknown) => {
  const name = str(v)
  props.form.borderCustomsOfficeName = name
  props.form.borderCustomsOfficeCode = name ? (name.match(/^\d+/)?.[0] ?? name) : ''
}

// ---- Гр. 30: код места ----
const location = computed(() => withCurrent(dedupeOptions(classifiers.options('goods-locations')), props.form.goodsLocationCode))
const modalOpen = ref(false)
const modalCode = computed(() => (location.value.unknown ? (props.form.goodsLocationCode ?? '') : ''))
const onLocationSaved = (code: string) => { props.form.goodsLocationCode = code }

// ---- Гр. 30: номер СВХ / ТС из реестров ----
const registryRows = ref<WarehouseRegistryItem[]>([])
const SEARCH_PAUSE_MS = 300
let registryTimer: ReturnType<typeof setTimeout> | undefined
let registrySeq = 0
const registryOptions = computed(() => registryRows.value.map((r) => ({
  value: `reg:${r.id}`,
  label: warehouseValue(r),
  number: warehouseValue(r),
  owner: r.ownerName,
  // Адрес и орган — из записи реестра КЕДЕН (у старых записей КГД органа нет).
  sub: [r.address, r.customsOfficeCode ? tc('officeShort', { code: r.customsOfficeCode }) : ''].filter(Boolean).join(' · '),
  kindLabel: (r.kind === 'svh' ? tc('kindSvh') : tc('kindTs')) + (r.warehouseType ? `, ${r.warehouseType.toLowerCase()}` : ''),
  suspended: r.isSuspended,
})))
const onRegistrySearch = (q: string) => {
  clearTimeout(registryTimer)
  const term = (q ?? '').trim()
  if (term.startsWith('reg:')) return // поле эхом присылает ключ выбранной подсказки
  if (term.length < 2) { registrySeq++; registryRows.value = []; return }
  registryTimer = setTimeout(async () => {
    const seq = ++registrySeq
    try {
      const rows = await warehouseRegistryApi.search(term)
      if (seq === registrySeq) registryRows.value = rows
    } catch {
      if (seq === registrySeq) registryRows.value = [] // реестр — подсказка: без него остаётся ручной ввод
    }
  }, SEARCH_PAUSE_MS)
}
onBeforeUnmount(() => { clearTimeout(registryTimer); registrySeq++ })

const comboKey = ref(0)
const numberCombo = ref<InstanceType<typeof ZCombobox> | null>(null)
const onNumberInput = (v: string) => {
  if (v.startsWith('reg:')) return // выбор из списка обработает onRegistrySelect
  props.form.goodsLocationRegisterNumber = (v ?? '').toUpperCase()
}
const onRegistrySelect = async (key: unknown) => {
  const id = Number(String(key).replace('reg:', ''))
  const row = registryRows.value.find((r) => r.id === id)
  if (!row) return
  const next = warehouseValue(row).toUpperCase()
  const same = props.form.goodsLocationRegisterNumber === next
  props.form.goodsLocationRegisterNumber = next
  // Адрес подставляем только в пустое поле — введённое декларантом не затираем.
  if (!(props.form.goodsLocationAddress ?? '').trim() && row.address) props.form.goodsLocationAddress = row.address.toUpperCase()
  suggestOffice(row)
  // Номер не изменился — поле не узнает о выборе и осталось бы с ключом подсказки: пересоздаём.
  if (same) {
    comboKey.value++
    await nextTick()
    numberCombo.value?.focus()
  }
}
const numberHelp = computed(() => {
  switch (checkWarehouseNumber(props.form.goodsLocationRegisterNumber)) {
    case 'checksum': return tc('numberChecksum')
    case 'format': return tc('numberFormat')
    case 'legacy': return tc('numberLegacy')
    default: return null
  }
})

// ---- Гр. 30: страна и орган места ----
const country = computed(() => withCurrent(countries.value as ZOption[], props.form.goodsLocationCountryCode))
const office = computed(() => withCurrent(props.postOptions, props.form.goodsLocationCustomsOfficeCode))
const officeChoices = ref<WarehouseOfficeSuggestion[]>([])
// Орган из НСИ: однозначный — подставляем в пустое поле, несколько — варианты под полем (выбранное вручную не затираем).
const suggestOffice = (row: WarehouseRegistryItem) => {
  const offices = row.customsOffices ?? []
  officeChoices.value = offices.length > 1 ? offices : []
  if ((props.form.goodsLocationCustomsOfficeCode ?? '').trim()) return
  if (row.customsOfficeCode) {
    props.form.goodsLocationCustomsOfficeCode = row.customsOfficeCode
    message.info(tc('officeFromNsi', { code: row.customsOfficeCode }))
  }
}
const pickOffice = (code: string) => { props.form.goodsLocationCustomsOfficeCode = code }
const officePlaceholder = computed(() => {
  const code = (props.form.submissionCustomsOfficeCode ?? '').trim()
  return code ? tc('officeAsSubmission', { code }) : tc('officeAsSubmissionEmpty')
})

// ---- Гр. 30: станция, адрес, код 52 ----
const isOnTransport = computed(() => (props.form.goodsLocationCode ?? '').trim() === '52')
// Снятие флажка возвращает код, стоявший до включения (C3), а не стирает графу. Код запоминается при включении;
// если ДТ открыта уже с кодом 52 (или кода не было) — возвращать нечего, графа очищается.
let previousCode = ''
const onOnTransport = (checked: boolean) => {
  const current = (props.form.goodsLocationCode ?? '').trim()
  if (checked) {
    if (current !== '52') previousCode = current
    props.form.goodsLocationCode = '52'
    return
  }
  props.form.goodsLocationCode = previousCode
  previousCode = ''
}
// Старые данные: в «Станцию» вписан номер вагона/ТС (одни цифры) — как название места он не выгружается.
const stationLooksLikeVehicleNumber = computed(() => /^\d+$/.test((props.form.goodsLocationStation ?? '').trim()))

const h2 = 'm-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink'
const graphTag = 'font-mono text-xs font-normal text-muted'
</script>

<template>
  <section class="@container flex flex-col gap-6" data-dt-customs>
    <div class="flex flex-col gap-4" data-customs-border>
      <h2 :class="h2">
        {{ tc('borderTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '29' }) }}</span>
      </h2>
      <div class="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <ZField graph="29" data-graph="29" v-bind="warn(border.unknown, form.borderCustomsOfficeName)">
          <template #label>{{ tc('border') }}<DtGraphHelp graph="29" /></template>
          <ZSelect :value="form.borderCustomsOfficeName || null" :options="border.options" show-search allow-clear :disabled="readonly" :placeholder="tc('borderPlaceholder')" popup-width="560px" data-border-post @update:value="onBorder" />
        </ZField>
      </div>
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-customs-location>
      <h2 :class="h2">
        {{ tc('locationTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '30' }) }}</span>
        <DtGraphHelp graph="30" />
      </h2>
      <div class="grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3">
        <ZField graph="30" data-graph="30" v-bind="warn(location.unknown, form.goodsLocationCode)">
          <template #label>{{ tc('locationCode') }}</template>
          <ZSelect :value="form.goodsLocationCode || null" :options="location.options" show-search allow-clear :disabled="readonly" :placeholder="tc('locationPlaceholder')" popup-width="360px" data-location-code @update:value="form.goodsLocationCode = str($event)" />
          <template v-if="!readonly" #extra>
            <button
              type="button"
              class="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent p-0 font-sans text-xs font-semibold text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
              data-location-add
              @click="modalOpen = true"
            ><PhPlus :size="12" weight="bold" aria-hidden="true" />{{ tc('locationAdd') }}</button>
          </template>
        </ZField>
        <ZField graph="30" :validate-status="numberHelp ? 'warning' : ''" :help="numberHelp ?? undefined">
          <template #label>{{ tc('number') }}</template>
          <ZCombobox
            :key="comboKey"
            ref="numberCombo"
            mono
            :value="form.goodsLocationRegisterNumber"
            :options="registryOptions"
            :filter-option="false"
            :disabled="readonly"
            :placeholder="tc('numberPlaceholder')"
            popup-width="440px"
            data-register-number
            @search="onRegistrySearch"
            @update:value="onNumberInput"
            @select="onRegistrySelect"
          >
            <template #option="o">
              <span class="flex min-w-0 flex-1 flex-col gap-0.5 whitespace-normal leading-snug" data-registry-option>
                <span class="flex flex-wrap items-center gap-1.5">
                  <b class="font-mono text-[13px] font-semibold text-ink">{{ o.number }}</b>
                  <span class="text-xs text-muted">{{ o.kindLabel }}</span>
                  <ZTag v-if="o.suspended" tone="wait" size="sm">{{ tc('suspended') }}</ZTag>
                </span>
                <span class="text-xs text-muted">{{ o.owner }}<template v-if="o.sub"> · {{ o.sub }}</template></span>
              </span>
            </template>
          </ZCombobox>
        </ZField>
        <ZField graph="30" :label="tc('country')" v-bind="warn(country.unknown, form.goodsLocationCountryCode)">
          <ZSelect :value="form.goodsLocationCountryCode || null" :options="country.options" show-search allow-clear :disabled="readonly" placeholder="KZ" data-location-country @update:value="form.goodsLocationCountryCode = str($event)" />
        </ZField>
      </div>

      <!-- Орган места нахождения (CustomsOfficeCode гр. 30) может отличаться от поста подачи; пусто — уходит пост подачи. -->
      <div class="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <ZField graph="30" :label="tc('office')" :extra="tc('officeHint')" v-bind="warn(office.unknown, form.goodsLocationCustomsOfficeCode)">
          <ZSelect :value="form.goodsLocationCustomsOfficeCode || null" :options="office.options" show-search allow-clear :disabled="readonly" :placeholder="officePlaceholder" popup-width="560px" data-location-office @update:value="form.goodsLocationCustomsOfficeCode = str($event)" />
          <div v-if="officeChoices.length > 1 && !readonly" class="mt-2 flex flex-col gap-1.5" data-office-choices>
            <span class="text-xs text-muted">{{ tc('officeChoose') }}</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="o in officeChoices"
                :key="o.customsOfficeCode"
                type="button"
                :aria-pressed="o.customsOfficeCode === form.goodsLocationCustomsOfficeCode"
                :title="[o.ownerName, o.address].filter(Boolean).join(' · ')"
                :class="[
                  'inline-flex min-h-8 max-w-full cursor-pointer items-center rounded-pill border px-3 font-sans text-xs outline-hidden focus-visible:shadow-focus max-sm:min-h-11',
                  o.customsOfficeCode === form.goodsLocationCustomsOfficeCode ? 'border-zircon-ink bg-zircon-soft font-semibold text-zircon-ink' : 'border-line bg-surface text-ink-2 hover:bg-sunken',
                ]"
                data-office-choice
                @click="pickOffice(o.customsOfficeCode)"
              ><span class="truncate"><b class="font-mono font-semibold">{{ o.customsOfficeCode }}</b><template v-if="o.address"> · {{ o.address }}</template></span></button>
            </div>
          </div>
        </ZField>
      </div>

      <!-- «Станция» — название станции/места (СТ.АКСЕНГЕР); номера вагонов/ТС в XML берутся из гр. 18. -->
      <div class="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <ZField
          graph="30"
          :label="tc('station')"
          :extra="isOnTransport ? tc('stationOnTransport') : undefined"
          :validate-status="stationLooksLikeVehicleNumber ? 'warning' : ''"
          :help="stationLooksLikeVehicleNumber ? tc('stationVehicleNumber') : undefined"
        >
          <ZInput v-uppercase :value="form.goodsLocationStation" :disabled="readonly" :placeholder="tc('stationPlaceholder')" data-location-station @update:value="form.goodsLocationStation = $event" />
        </ZField>
        <ZField graph="30" :label="tc('address')">
          <ZInput v-uppercase :value="form.goodsLocationAddress" :disabled="readonly" :placeholder="tc('addressPlaceholder')" data-location-address @update:value="form.goodsLocationAddress = $event" />
        </ZField>
      </div>

      <ZCheckbox class="min-h-11" :checked="isOnTransport" :disabled="readonly" data-on-transport @update:checked="onOnTransport">
        {{ tc('onTransport') }}
      </ZCheckbox>
    </div>

    <GoodsLocationModal v-model:open="modalOpen" :initial-code="modalCode" @saved="onLocationSaved" />
  </section>
</template>
