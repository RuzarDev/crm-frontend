<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import KatoField from '@/components/broker/KatoField.vue'
import { isBinLike, type CompanyLookupDto } from '@/api/companyLookup'
import { useBinLookup } from '@/composables/useBinLookup'
import { vUppercase } from '@/directives/uppercase'
import type { ZOption } from '@/ui/options'
import { withCurrent } from '../dtOptions'
import { MAX_HOUSE_LEN, MAX_SETTLEMENT_LEN, overLimit, partyHas, type PartyField, type PartyKey, type PartyPatch, type PartyValues } from '../dtParties'

// Поля одной стороны ДТ (гр. 2, 8, 9, 14). Гр. 2 — без БИН, категории и КАТО (иностранный отправитель). Форму не
// пишет: каждое изменение — событие update с частью полей, «Найти по БИН» — found с карточкой реестра (что
// подставлять, решает раздел). Текстовые поля — UPPERCASE (v-uppercase), БИН — без регистра, только цифры.
const props = defineProps<{
  partyKey: PartyKey
  values: PartyValues
  readonly: boolean
  countryOptions: ZOption[]
  categoryOptions: ZOption[]
  /** Номер графы: data-graph на первом поле — переход «к недостающему» из панели «До подачи». */
  graph: string
}>()
const emit = defineEmits<{ update: [patch: PartyPatch]; found: [company: CompanyLookupDto] }>()
const { t } = useI18n()
const tp = (key: string, named?: Record<string, unknown>) => t(`broker.dt.parties.${key}`, named ?? {})

const has = (f: PartyField) => partyHas(props.partyKey, f)
const set = (f: PartyField) => (v: unknown) => emit('update', { [f]: v == null || v === '' ? null : String(v) })

const country = computed(() => withCurrent(props.countryOptions, props.values.countryCode))
const category = computed(() => withCurrent(props.categoryOptions, props.values.categoryCode))
const warnNotInList = (unknown: boolean, value: string | null) =>
  unknown ? { validateStatus: 'warning' as const, help: tp('notInList', { value: value ?? '' }) } : {}
const lengthError = (v: string | null, max: number) => {
  const n = overLimit(v, max)
  return n === null ? {} : { error: tp('tooLong', { max, n }) }
}

const { loading: binLoading, lookup } = useBinLookup()
const binReady = computed(() => isBinLike(props.values.bin))
const findByBin = async () => {
  const company = await lookup(props.values.bin)
  if (company) emit('found', company)
}
const firstGraph = (f: PartyField) => ((has('bin') ? 'bin' : 'name') === f ? props.graph : undefined)
</script>

<template>
  <div class="@container flex flex-col gap-4" :data-party-fields="partyKey">
    <div v-if="has('bin')" class="flex flex-wrap items-end gap-x-3 gap-y-2">
      <ZField :label="tp('bin')" class="w-full @md:w-56" :data-graph="firstGraph('bin')">
        <ZInput :value="values.bin" mono inputmode="numeric" :disabled="readonly" data-party-input="bin" @update:value="set('bin')($event)" />
      </ZField>
      <template v-if="!readonly">
        <ZButton
          class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11"
          :disabled="!binReady"
          :loading="binLoading"
          :title="t(binReady ? 'binLookup.tipReady' : 'binLookup.tipEnter')"
          data-bin-lookup
          @click="findByBin"
        >
          <template #icon><PhMagnifyingGlass :size="16" aria-hidden="true" /></template>
          {{ tp('findByBin') }}
        </ZButton>
        <span class="min-w-0 basis-full pb-2.5 text-xs text-muted @2xl:basis-auto @2xl:flex-1">{{ tp('binHint') }}</span>
      </template>
    </div>

    <div class="grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3">
      <ZField :label="tp('name')" class="@md:col-span-2" :data-graph="firstGraph('name')">
        <ZInput v-uppercase :value="values.name" :disabled="readonly" data-party-input="name" @update:value="set('name')($event)" />
      </ZField>
      <ZField :label="tp('shortName')">
        <ZInput v-uppercase :value="values.shortName" :disabled="readonly" data-party-input="shortName" @update:value="set('shortName')($event)" />
      </ZField>
      <ZField :label="tp('country')" v-bind="warnNotInList(country.unknown, values.countryCode)">
        <ZSelect
          :value="values.countryCode || null"
          :options="country.options"
          show-search
          allow-clear
          :disabled="readonly"
          :placeholder="tp('select')"
          data-party-input="countryCode"
          @update:value="set('countryCode')($event)"
        />
      </ZField>
      <ZField :label="tp('region')">
        <ZInput v-uppercase :value="values.region" :disabled="readonly" data-party-input="region" @update:value="set('region')($event)" />
      </ZField>
      <ZField :label="tp('district')">
        <ZInput v-uppercase :value="values.district" :disabled="readonly" data-party-input="district" @update:value="set('district')($event)" />
      </ZField>
      <ZField :label="tp('city')">
        <ZInput v-uppercase :value="values.city" :disabled="readonly" data-party-input="city" @update:value="set('city')($event)" />
      </ZField>
      <ZField :label="tp('settlement')" v-bind="lengthError(values.settlement, MAX_SETTLEMENT_LEN)">
        <ZInput v-uppercase :value="values.settlement" :maxlength="MAX_SETTLEMENT_LEN" :disabled="readonly" data-party-input="settlement" @update:value="set('settlement')($event)" />
      </ZField>
      <ZField :label="tp('street')">
        <ZInput v-uppercase :value="values.street" :disabled="readonly" data-party-input="street" @update:value="set('street')($event)" />
      </ZField>
      <ZField :label="tp('house')" v-bind="lengthError(values.house, MAX_HOUSE_LEN)">
        <ZInput v-uppercase :value="values.house" :disabled="readonly" data-party-input="house" @update:value="set('house')($event)" />
      </ZField>
      <ZField :label="tp('apt')" v-bind="lengthError(values.apt, MAX_HOUSE_LEN)">
        <ZInput v-uppercase :value="values.apt" :disabled="readonly" data-party-input="apt" @update:value="set('apt')($event)" />
      </ZField>
      <ZField v-if="has('categoryCode')" :label="tp('category')" v-bind="warnNotInList(category.unknown, values.categoryCode)">
        <ZSelect
          :value="values.categoryCode || null"
          :options="category.options"
          show-search
          allow-clear
          :disabled="readonly"
          :placeholder="tp('select')"
          data-party-input="categoryCode"
          @update:value="set('categoryCode')($event)"
        />
      </ZField>
      <ZField v-if="has('katoCode')" :label="tp('kato')">
        <KatoField :value="values.katoCode" :disabled="readonly" data-party-input="katoCode" @update:value="set('katoCode')($event)" />
      </ZField>
    </div>
  </div>
</template>
