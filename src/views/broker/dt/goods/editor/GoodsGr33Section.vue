<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZField from '@/components/z/ZField.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { useTroisCheck } from '@/composables/useTroisCheck'
import { troisApi, troisDate, type TroisItem } from '@/api/trois'
import { invalidFeatureCodes, joinFeatureCodes, splitFeatureCodes } from '@/utils/nonTariffCodes'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { cn } from '@/ui/cn'
import { useGr33Suggest } from '../useGr33Suggest'
import type { GoodsSectionProps } from './types'

// «Гр. 33» (доска DtGoodsEditor): ОИС — индикатор, рег. № (подсказки ТРОИС), страна; признаки соблюдения запретов С/М/П
// (CSV «С,М,П», как раньше); коды запретов и ограничений — только из подсказок КЕДЕН по коду ТН ВЭД, когда он ответил
// (useGr33Suggest; экспортные при импорте скрыты), иначе — весь справочник. НИЧЕГО не подставляется само: чип добавляет
// код по нажатию, «Добавить «не подпадает»» — все подсказанные XX00; признак ОИС по ТРОИС не ставится — только подсказка.
// Сертификация (гр. 33, «; ») — в «Льготах и процедуре» рядом с процедурой, как в старой карточке.
// Ни одно поле — не поле платежей: «Пересчитать» не ставят.
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.gr33.${key}`, p ?? {})
const classifiers = useClassifiersStore()

const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))
// Список — подпись только код (метки и закрытое поле узкие), полное название — строкой пункта и поиском.
const codeOptions = (code: string): ZOption[] => classifiers.options(code)
  .map((o) => ({ value: o.value, label: String(o.value), name: o.label, search: o.label }))
const withValue = (opts: ZOption[], v: string | null | undefined): ZOption[] =>
  (!v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v, name: v, search: v }, ...opts])

// ---- ОИС ----
// Индикатор — одно значение: в закрытом поле полная подпись («I — …»), не только буква.
const indicatorOptions = computed(() => {
  const opts = classifiers.options('ois-indicators')
  const v = props.item.oisIndicatorCode
  return !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v }, ...opts]
})
const countryOptions = useCountryAlpha2Options()
const oisCountryOptions = computed<ZOption[]>(() => withValue(
  countryOptions.value.map((o) => ({ value: o.value, label: o.value, name: o.label, search: o.label })), props.item.oisCountryCode))

// ТРОИС: торговая марка найдена среди действующих знаков (точно или «похоже») — подсказка у ОИС; сам признак не ставим.
const trois = useTroisCheck()
const troisMatches = computed(() => trois?.resultFor(props.item.tradeMarkName)?.matches ?? [])
const troisFound = computed(() => troisMatches.value.some((m) => m.isActive && (m.match === 'exact' || m.match === 'similar')))

// Рег. № по ОИС: пока не ищут — знаки по торговой марке товара (действующие сначала); ввод от 2 знаков — поиск по номеру,
// названию, правообладателю (пауза 300 мс). Свой номер вписать можно; выбор подсказки ставит страну KZ, если пусто.
const regSearch = ref<TroisItem[] | null>(null)
let regTimer: number | undefined
let regSeq = 0
const regOptions = computed<ZOption[]>(() => {
  const list = regSearch.value ?? [...troisMatches.value].sort((a, b) => Number(b.isActive) - Number(a.isActive))
  const seen = new Set<string>()
  return list
    .filter((m) => !seen.has(m.registrationNumber) && seen.add(m.registrationNumber))
    .slice(0, 20)
    .map((m) => ({ value: m.registrationNumber, label: `№ ${m.registrationNumber} ${m.objectName}`, item: m }))
})
const onRegSearch = (q: string) => {
  window.clearTimeout(regTimer)
  const term = q.trim()
  const my = ++regSeq
  if (term.length < 2) { regSearch.value = null; return }
  regTimer = window.setTimeout(async () => {
    try {
      const found = await troisApi.search(term)
      if (my === regSeq) regSearch.value = found
    } catch {
      if (my === regSeq) regSearch.value = []
    }
  }, 300)
}
onBeforeUnmount(() => window.clearTimeout(regTimer))
const onRegInput = (v: string) => { props.model.setField(props.item, 'oisRegNumber', (v ?? '').toLocaleUpperCase('ru-RU') || null) }
const onRegSelect = (v: ZOptionValue) => {
  props.model.setField(props.item, 'oisRegNumber', String(v))
  // ТРОИС — таможенный реестр Казахстана: страна реестра — KZ, если декларант её ещё не указал.
  if (!props.item.oisCountryCode) props.model.setField(props.item, 'oisCountryCode', 'KZ')
  regSearch.value = null
}
const optionItem = (o: Record<string, unknown>) => o.item as TroisItem
// Формат номера структуры ДТ (KedenXmlExporter.IpObjectIdRe) — иначе номер в XML не попадёт.
const REG_RE = /^(\d{1,4}|\d{5}\/[А-Я]{2}-\d{6}|\d{5}\/\d{6}\/\d{2}-[А-Я]{2}-\d{6}|\d{5}\/\d{5}-\d{3}\/[А-Я]{2}-\d{6}|\d{5}\/[А-Я]{2}-\d{4}-\d{6})$/
const regBad = computed(() => { const v = (props.item.oisRegNumber ?? '').trim(); return !!v && !REG_RE.test(v) })

// ---- Признаки соблюдения запретов: CSV «С,М,П» ----
const marks = computed(() => (props.item.restrictionMarks ?? '').split(',').map((s) => s.trim()).filter(Boolean))
const marksOptions = computed(() => marks.value.reduce((opts, m) => withValue(opts, m), codeOptions('restriction-marks')))
const onMarks = (v: ZOptionValue | ZOptionValue[] | null) => {
  const list = (Array.isArray(v) ? v : v == null ? [] : [v]).map(String)
  props.model.setField(props.item, 'restrictionMarks', list.length ? list.join(',') : null)
}

// ---- Коды запретов и ограничений ----
const gr33 = useGr33Suggest(() => ({ tnved: props.item.tnvedCode, procedure: props.item.procedureCode || props.ctx.declProcedure }))
const codes = computed(() => splitFeatureCodes(props.item.prohibitionCode))
const codeChoices = computed<ZOption[]>(() => {
  const opts: ZOption[] = gr33.choices.value.map((c) => ({
    value: c.code, label: c.code, name: c.name ?? '', search: `${c.code} ${c.name ?? ''} ${c.category ?? ''}`,
  }))
  return codes.value.reduce((acc, c) => withValue(acc, c), opts)
})
const setCodes = (list: string[]) => { props.model.setField(props.item, 'prohibitionCode', joinFeatureCodes(list)) }
const onCodes = (v: ZOptionValue | ZOptionValue[] | null) => setCodes((Array.isArray(v) ? v : v == null ? [] : [v]).map(String))
const addCode = (code: string) => {
  if (props.readonly || codes.value.includes(code)) return
  setCodes([...codes.value, code])
}
const negatives = computed(() => gr33.negativeToAdd(codes.value))
const addNegatives = () => {
  if (props.readonly || !negatives.value.length) return
  setCodes([...codes.value, ...negatives.value])
}
const invalid = computed(() => invalidFeatureCodes(props.item.prohibitionCode))
const rejected = computed(() => gr33.rejected(codes.value.filter((c) => !invalid.value.includes(c))))
const unknown = computed(() => gr33.unknown(codes.value))
const codesStatus = computed(() => {
  if (invalid.value.length) return { validateStatus: 'warning' as const, help: tg('codesFormat', { codes: invalid.value.join(', ') }) }
  if (rejected.value.length) return { validateStatus: 'warning' as const, help: tg('codesRejected', { code: gr33.state.tnved, codes: rejected.value.join(', ') }) }
  if (unknown.value.length) return { validateStatus: 'warning' as const, help: tg('codesUnknown', { codes: unknown.value.join(', ') }) }
  return {}
})
const codesScope = computed(() => {
  if (gr33.byTnved.value) return gr33.visible.value.length ? tg('scopeTnved', { code: gr33.state.tnved }) : ''
  return gr33.referenceSize.value ? tg('scopeAll', { n: gr33.referenceSize.value }) : ''
})
const codesEmptyText = computed(() => (gr33.byTnved.value
  ? tg(gr33.state.codes.length ? 'noImportCodes' : 'noCodes', { code: gr33.state.tnved })
  : undefined))

const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @sm:grid-cols-2 @4xl:grid-cols-4'
const tall = 'max-sm:h-11'
const chip = (on: boolean) => cn(
  'inline-flex h-7 cursor-pointer items-center rounded-pill border px-2.5 font-mono text-xs outline-hidden transition-colors',
  'focus-visible:shadow-focus max-sm:h-11 max-sm:px-3.5 pointer-coarse:h-11 disabled:cursor-default',
  on ? 'border-line bg-sunken text-muted' : 'border-line-strong bg-surface text-ink hover:border-zircon hover:bg-zircon-soft',
)
</script>

<template>
  <div class="flex flex-col gap-5" data-goods-gr33-section>
    <div :class="grid">
      <ZField graph="33" :label="tg('oisIndicator')" :help="troisFound ? tg('troisFound') : undefined" :validate-status="troisFound ? 'warning' : ''" data-graph="33" :data-goods-index="index" data-goods-field="oisIndicatorCode">
        <ZSelect :value="item.oisIndicatorCode || null" :options="indicatorOptions" allow-clear :disabled="readonly" :placeholder="tg('choose')" popup-width="320px" :class="tall" data-f="oisIndicatorCode" @update:value="model.setField(item, 'oisIndicatorCode', str($event))" />
      </ZField>
      <ZField graph="33" :label="tg('oisRegNumber')" class="@sm:col-span-2" v-bind="regBad ? { validateStatus: 'warning', help: tg('regFormat') } : {}" data-graph="33" :data-goods-index="index" data-goods-field="oisRegNumber">
        <ZCombobox :value="item.oisRegNumber ?? ''" :options="regOptions" :filter-option="false" mono allow-clear :disabled="readonly" :placeholder="tg('regPlaceholder')" popup-width="460px" :class="tall" data-f="oisRegNumber" @update:value="onRegInput" @search="onRegSearch" @select="onRegSelect">
          <template #option="o">
            <div :class="cn('flex min-w-0 flex-1 flex-col leading-[1.35]', !optionItem(o).isActive && 'opacity-60')" :data-trois-option="o.value">
              <span class="truncate"><b class="font-mono font-semibold">№ {{ o.value }}</b> {{ optionItem(o).objectName }}<span v-if="!optionItem(o).isActive" class="text-gold-ink"> · {{ tg('troisInactive') }}</span></span>
              <span class="truncate text-xs text-muted">{{ optionItem(o).rightHolder ?? '—' }}<template v-if="optionItem(o).validUntil"> · {{ tg('troisUntil', { date: troisDate(optionItem(o).validUntil) }) }}</template></span>
            </div>
          </template>
        </ZCombobox>
      </ZField>
      <ZField graph="33" :label="tg('oisCountry')" data-graph="33" :data-goods-index="index" data-goods-field="oisCountryCode">
        <ZSelect :value="item.oisCountryCode || null" :options="oisCountryOptions" show-search option-filter-prop="search" allow-clear :disabled="readonly" placeholder="KZ" popup-width="320px" :class="tall" data-f="oisCountryCode" @update:value="model.setField(item, 'oisCountryCode', str($event))">
          <template #option="{ option }">{{ option.name }}</template>
        </ZSelect>
      </ZField>
      <ZField graph="33" :label="tg('restrictionMarks')" class="@sm:col-span-2" data-graph="33" :data-goods-index="index" data-goods-field="restrictionMarks">
        <ZSelect :value="marks" mode="multiple" :options="marksOptions" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tg('restrictionMarksPlaceholder')" popup-width="380px" :class="tall" data-f="restrictionMarks" @update:value="onMarks">
          <template #option="{ option }">{{ option.name }}</template>
        </ZSelect>
      </ZField>
    </div>

    <div class="flex flex-col gap-2">
      <ZField graph="33" :label="tg('codes')" :title="tg('codesHint')" :extra="codesScope || undefined" v-bind="codesStatus" data-graph="33" :data-goods-index="index" data-goods-field="prohibitionCode">
        <ZSelect :value="codes" mode="tags" :options="codeChoices" option-filter-prop="search" allow-clear :disabled="readonly" :loading="gr33.state.loading" :not-found-content="codesEmptyText" :placeholder="tg('codesPlaceholder')" popup-width="520px" :class="tall" data-f="prohibitionCode" @update:value="onCodes">
          <template #option="{ option }"><span class="font-mono">{{ option.value }}</span><span v-if="option.name" class="text-ink-3"> — {{ option.name }}</span></template>
        </ZSelect>
      </ZField>

      <!-- Подсказки КЕДЕН по ТН ВЭД: добавляются только нажатием — коды выбирает декларант. -->
      <div v-if="!readonly && gr33.state.tnved" class="flex flex-wrap items-center gap-1.5 text-xs max-sm:gap-2" data-gr33-suggest>
        <span v-if="gr33.state.loading" class="text-muted" role="status">{{ tg('suggestLoading') }}</span>
        <template v-else-if="gr33.visible.value.length">
          <span class="mr-1 text-muted">{{ tg('suggestFor', { code: gr33.state.tnved }) }}</span>
          <button
            v-for="c in gr33.visible.value"
            :key="c.code"
            type="button"
            :class="chip(codes.includes(c.code))"
            :disabled="codes.includes(c.code)"
            :aria-pressed="codes.includes(c.code)"
            :title="gr33.nameOf(c.code) ?? c.code"
            :data-gr33-chip="c.code"
            @click="addCode(c.code)"
          >{{ c.code }}</button>
          <ZButton v-if="negatives.length" variant="ghost" size="sm" :title="tg('addNegativeHint')" class="max-sm:h-11 pointer-coarse:h-11" data-gr33-negatives @click="addNegatives">
            <PhPlus :size="14" aria-hidden="true" />{{ tg('addNegative') }}
          </ZButton>
          <span v-if="gr33.state.warning" class="text-gold-ink" data-gr33-stale>{{ tg('suggestStale') }}</span>
        </template>
        <span v-else-if="gr33.state.codes.length" class="text-muted" data-gr33-note>{{ tg('noImportCodes', { code: gr33.state.tnved }) }}</span>
        <span v-else class="text-muted" data-gr33-note>{{ gr33.state.failed ? tg('suggestFailed') : tg('noCodes') }}</span>
      </div>
    </div>
  </div>
</template>
