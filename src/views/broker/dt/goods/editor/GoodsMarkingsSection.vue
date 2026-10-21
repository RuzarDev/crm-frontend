<script setup lang="ts">
import { computed, nextTick, ref, shallowReactive, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowCounterClockwise, PhClipboardText, PhFileXls, PhGearSix, PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { vUppercase } from '@/directives/uppercase'
import { message } from '@/ui/message'
import type { Import40GoodsMarking } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { cn } from '@/ui/cn'
import type { CodeProblem } from './tradeCodes'
import {
  adoptKizDefaults, customFields, hasKizNumber, isCustomMarking, kizDefaultsEmpty, kizFollowers, kizState, markingFromDefaults,
  resetMarkingToDefaults, setKizAfterRelease, setKizDefault, type KizSharedField,
} from './kizDefaults'
import { KIZ_NUMBER_MAX, appendKizNumbers, appendKizRows, kizKey, kizNumberProblem, parseKizPaste } from './kizCodes'
import { readKizWorkbook, scanKizWorkbook, type KizExcelApply, type KizExcelScan, type KizSheet } from './kizExcel'
import GoodsTradeCodesBlock from './GoodsTradeCodesBlock.vue'
import KizExcelModal from './KizExcelModal.vue'
import MarkingHint from './MarkingHint.vue'
import { useMarkingList } from '../useMarkingList'
import type { GoodsSectionProps } from './types'

// «Маркировка» (гр. 31.13, коллекция строк). Правка №12 (21.10.2026): уровень, идентификатор применения, вид, количество
// КИЗ, «агрегированная» и «после выпуска» задаются один раз — «Для всех кодов» (kizDefaults.ts); строка кода — только
// номер (GTIN), свои значения — по «Изменить для этого кода». Быстрый ввод: «+», Enter (сканер), вставка столбца в поле
// номера, «Вставить списком»; «Из Excel» — столбец GTIN ищется по шапке или содержимому, предпросмотр (KizExcelModal).
// GTIN проверяется по контрольной цифре GS1 — подсказка, сохранение не блокирует (как KedenXmlReadiness.KizWarnings).
// Не поля платежей. Строк бывает тысячи — показываем первые 10, дальше «Показать ещё».
// Сверху — гр. 33.3 «Маркировка» (NTIN и GTIN): GoodsTradeCodesBlock. Под заголовком — подсказка «подлежит маркировке
// с …» по перечню Приказа МТИ № 199-НҚ на дату гр. А (MarkingHint).
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.markings.${key}`, p ?? {})
const problemText = (p: CodeProblem) => tm(`problems.${p.kind}`, 'n' in p ? { n: p.n } : {})

const markingList = useMarkingList(() => ({ code: props.item.tnvedCode, onDate: props.ctx.onDate }))

const PAGE = 10
const MORE = 50
const limit = ref(PAGE)
const markings = computed(() => props.item.markings ?? [])
// Строки, добавленные кнопкой в этом товаре, видны всегда (после первых limit), даже за пределами страницы:
// добавление строки не раскрывает весь список (400 кодов из Excel не монтируются разом).
const added = shallowReactive(new Set<Import40GoodsMarking>())
const shown = computed(() => {
  const out: { m: Import40GoodsMarking; i: number }[] = []
  markings.value.forEach((m, i) => { if (i < limit.value || added.has(m)) out.push({ m, i }) })
  return out
})
const hidden = computed(() => Math.max(0, markings.value.length - shown.value.length))

// Общие значения и ручные правки — сеанс товара (по объекту товара; секция переиспользуется при переходе).
const st = computed(() => kizState(props.item))
const defaults = computed(() => st.value.defaults)

// Подпись в поле — только код (колонки узкие), название — строкой списка и поиском.
const codeOpts = (group: string, codes: readonly string[]): ZOption[] =>
  codes.map((c) => ({ value: c, label: c, name: tm(`${group}.${c}`), search: tm(`${group}.${c}`) }))
const LEVELS = ['0', '1', '2', '3', '4'] as const
const APPLICATIONS = ['00', '01', '02', '21', '91', '92'] as const
const TYPES = ['101', '301', '302', '303', '401', '999'] as const
const levelOptions = computed(() => codeOpts('levels', LEVELS))
const applicationOptions = computed(() => codeOpts('applications', APPLICATIONS))
const typeOptions = computed(() => codeOpts('types', TYPES))
const withValue = (opts: ZOption[], v: string | null | undefined) =>
  (!v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v, name: v, search: v }, ...opts])

const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))
const setNumber = (m: Import40GoodsMarking, v: string) => { m.number = v.trim() ? v : null }
/** Правка поля в раскрытой строке — ручная правка: смена общего значения её не трогает. */
const setRow = (m: Import40GoodsMarking, f: KizSharedField, v: string | number | boolean | null) => {
  ;(m as unknown as Record<string, unknown>)[f] = v
  st.value.markOverride(m, f)
}

// ---- «Для всех кодов» ----
const applied = ref(0)
const setDefault = (f: KizSharedField, v: string | number | boolean | null) => { applied.value = setKizDefault(props.item, f, v) }
// Количество набирается по цифре («1 → 2 → 20»): меняем строки, следовавшие общему значению до начала набора.
let kizFollowersSnap: Import40GoodsMarking[] | null = null
let kizApplied = 0
const setDefaultKiz = (v: number | null) => {
  if (!kizFollowersSnap) { kizFollowersSnap = kizFollowers(props.item, 'kizCount'); kizApplied = 0 }
  kizApplied = Math.max(kizApplied, setKizDefault(props.item, 'kizCount', v, kizFollowersSnap))
  applied.value = kizApplied
}
const endKizInput = () => { kizFollowersSnap = null }
const setAfter = (v: boolean) => { setKizAfterRelease(props.item, v) }

// ---- Строки ----
const expanded = shallowReactive(new Set<Import40GoodsMarking>())
const isCustom = (m: Import40GoodsMarking) => isCustomMarking(m, defaults.value)
// Общих значений нет, а у строки свои — показываем поля сразу (иначе не видно, что в ней).
const isOpen = (m: Import40GoodsMarking) => expanded.has(m) || (isCustom(m) && kizDefaultsEmpty(defaults.value))
const toggle = (m: Import40GoodsMarking) => { if (expanded.has(m)) expanded.delete(m); else expanded.add(m) }
const LABELS: Record<KizSharedField, string> = {
  levelCode: 'levelShort', idApplicationCode: 'applicationShort', idTypeCode: 'typeShort', kizCount: 'kizShort', aggregated: 'aggregated',
}
const customText = (m: Import40GoodsMarking) => customFields(m, defaults.value)
  .map((f) => (f === 'aggregated' ? tm(m.aggregated ? 'aggregatedYes' : 'aggregatedNo') : `${tm(LABELS[f])} ${m[f] ?? '—'}`))
  .join(' · ')
const reset = (m: Import40GoodsMarking) => {
  resetMarkingToDefaults(props.item, m)
  expanded.delete(m)
}
// «После выпуска» коды в XML не уходят — GTIN не проверяем (как сервер).
const problemOf = (m: Import40GoodsMarking) => (defaults.value.afterRelease ? null : kizNumberProblem(m.number, m.idApplicationCode))

const totals = computed(() => {
  const d = defaults.value
  let codes = 0
  let kiz = 0
  let custom = 0
  let blanks = 0
  let bad = 0
  for (const m of markings.value) {
    if (hasKizNumber(m)) codes += 1
    else blanks += 1
    kiz += m.kizCount ?? 0
    if (isCustomMarking(m, d)) custom += 1
    if (!d.afterRelease && kizNumberProblem(m.number, m.idApplicationCode)) bad += 1
  }
  return { codes, kiz, custom, blanks, bad }
})

const list = (): Import40GoodsMarking[] => {
  const g = props.item
  g.markings ??= []
  return g.markings
}
const root = ref<HTMLElement>()
const focusNumber = async (i: number) => {
  await nextTick()
  root.value?.querySelector<HTMLInputElement>(`input[data-f="marking-${i}-number"]`)?.focus()
}
const add = async () => {
  const arr = list()
  arr.push(markingFromDefaults(defaults.value))
  const i = arr.length - 1
  added.add(arr[i])
  await focusNumber(i)
}
const remove = (m: Import40GoodsMarking) => {
  const arr = list()
  const i = arr.indexOf(m)
  if (i >= 0) arr.splice(i, 1)
  added.delete(m)
  expanded.delete(m)
}
// Enter (сканер штрихкодов шлёт Enter) — к следующей строке; в последней заполненной — новая строка.
const onEnter = async (i: number) => {
  const arr = list()
  if (i < arr.length - 1) {
    if (i + 1 >= limit.value) added.add(arr[i + 1])
    await focusNumber(i + 1)
  } else if (hasKizNumber(arr[i])) await add()
}
const report = ({ added: n, duplicates }: { added: number; duplicates: number }) => {
  if (n) message.success(tm('pasteDone', { n }))
  if (duplicates) message.info(tm('pasteDuplicates', { n: duplicates }))
  if (!n && !duplicates) message.warning(tm('pasteEmpty'))
}
// Вставка столбца в поле номера: браузер склеил бы строки в одну — раскладываем по строкам (первый код — в эту строку,
// если она пуста; дальше — пустые строки, потом новые с общими значениями).
const onPaste = (i: number, e: ClipboardEvent) => {
  const text = e.clipboardData?.getData('text') ?? ''
  const codes = parseKizPaste(text)
  if (codes.length < 2 && !(codes.length === 1 && /[\r\n\t]/.test(text.trim()))) return
  e.preventDefault()
  report(appendKizNumbers(props.item, codes, defaults.value, i))
}

// «Вставить списком»
const pasting = ref(false)
const pasteText = ref('')
const openPaste = async () => {
  pasting.value = true
  await nextTick()
  root.value?.querySelector<HTMLTextAreaElement>('textarea[data-f="markings-paste"]')?.focus()
}
const applyPaste = () => {
  const res = appendKizNumbers(props.item, parseKizPaste(pasteText.value), defaults.value)
  report(res)
  if (res.added || res.duplicates) {
    pasteText.value = ''
    pasting.value = false
  }
}
const cancelPaste = () => { pasteText.value = ''; pasting.value = false }

// ---- Из Excel ----
const importing = ref(false)
const excelOpen = ref(false)
const excel = shallowRef<{ fileName: string; sheets: KizSheet[]; scan: KizExcelScan; existing: Set<string> } | null>(null)
const importExcel = async (file: File): Promise<boolean> => {
  importing.value = true
  try {
    const sheets = await readKizWorkbook(file)
    if (!sheets.length) { message.warning(tm('excelNoSheets')); return false }
    const existing = new Set(markings.value.map((m) => kizKey(m.number)).filter(Boolean))
    excel.value = { fileName: file.name, sheets, scan: scanKizWorkbook(sheets, existing), existing }
    excelOpen.value = true
  } catch {
    message.error(tm('excelFailed'))
  } finally {
    importing.value = false
  }
  return false
}
const onExcelApply = (res: KizExcelApply) => {
  excelOpen.value = false
  const d = { ...defaults.value }
  let n = 0
  let duplicates = 0
  let goods = 0
  if (res.legacy) {
    // Старый формат: уровень, идентификатор и вид — из файла; пустые в файле и количество — из общих значений.
    const rows = res.legacy.map((r) => ({
      ...markingFromDefaults(d, r.number),
      levelCode: r.levelCode ?? d.levelCode,
      idApplicationCode: r.idApplicationCode ?? d.idApplicationCode,
      idTypeCode: r.idTypeCode ?? d.idTypeCode,
    }))
    ;({ added: n, duplicates } = appendKizRows(props.item, rows))
  } else {
    for (const g of res.groups) {
      const target = props.model.items.value[g.goodsIndex]
      if (!target) continue
      // Товар-получатель без строк и без своих общих значений получает общие значения этого товара.
      if (toRaw(target) !== toRaw(props.item)) adoptKizDefaults(target, d)
      const r = appendKizNumbers(target, g.codes, d)
      n += r.added
      duplicates += r.duplicates
      if (r.added) goods += 1
    }
  }
  const elsewhere = res.groups.some((g) => g.goodsIndex !== props.index)
  if (n) message.success(elsewhere ? tm('excelDoneGoods', { n, goods }) : tm('excelDone', { n }))
  if (duplicates) message.info(tm('pasteDuplicates', { n: duplicates }))
  if (!n && !duplicates) message.warning(tm('pasteEmpty'))
}

watch(() => toRaw(props.item), () => {
  applied.value = 0
  kizFollowersSnap = null
  cancelPaste()
})

const fieldCell = 'flex min-w-0 flex-col gap-1'
const fieldLabel = 'text-xs text-muted'
const tall = 'max-sm:h-11'
const iconBtn = cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken focus-visible:shadow-focus max-sm:size-11',
)
</script>

<template>
  <div ref="root" class="flex flex-col gap-3" data-goods-markings-section>
    <GoodsTradeCodesBlock v-bind="props" />

    <h3 class="m-0 mt-2 border-t border-line pt-4 text-[13px] font-semibold text-ink">{{ tm('kizTitle') }}</h3>
    <p class="m-0 text-xs text-muted">{{ tm('hint') }}</p>
    <MarkingHint :rows="markingList.rows()" :act="markingList.act()" />

    <div class="flex flex-col gap-2" data-graph="31" data-goods-field="markings" :data-goods-index="index">
      <!-- Для всех кодов -->
      <section class="flex flex-col gap-2.5 rounded-row border border-line bg-sunken/50 p-3" data-markings-defaults :aria-label="tm('defaults')">
        <div class="flex flex-col gap-0.5">
          <span class="text-[13px] font-medium text-ink">{{ tm('defaults') }}</span>
          <span class="text-xs text-muted">{{ tm('defaultsHint') }}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 @xl:grid-cols-[repeat(3,minmax(0,9rem))_8.5rem]">
          <div :class="fieldCell">
            <span :class="fieldLabel">{{ tm('levelShort') }}</span>
            <ZSelect :value="defaults.levelCode" :options="withValue(levelOptions, defaults.levelCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('levelShort')" :aria-label="tm('level')" popup-width="300px" :class="tall" data-f="marking-default-level" @update:value="setDefault('levelCode', str($event))">
              <template #option="{ option }">{{ option.name }}</template>
            </ZSelect>
          </div>
          <div :class="fieldCell">
            <span :class="fieldLabel">{{ tm('applicationShort') }}</span>
            <ZSelect :value="defaults.idApplicationCode" :options="withValue(applicationOptions, defaults.idApplicationCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('applicationShort')" :aria-label="tm('application')" popup-width="300px" :class="tall" data-f="marking-default-application" @update:value="setDefault('idApplicationCode', str($event))">
              <template #option="{ option }">{{ option.name }}</template>
            </ZSelect>
          </div>
          <div :class="fieldCell">
            <span :class="fieldLabel">{{ tm('typeShort') }}</span>
            <ZSelect :value="defaults.idTypeCode" :options="withValue(typeOptions, defaults.idTypeCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('typeShort')" :aria-label="tm('type')" popup-width="280px" :class="tall" data-f="marking-default-type" @update:value="setDefault('idTypeCode', str($event))">
              <template #option="{ option }">{{ option.name }}</template>
            </ZSelect>
          </div>
          <div :class="fieldCell">
            <span :class="fieldLabel">{{ tm('kizPerCode') }}</span>
            <ZNumber :value="defaults.kizCount" :min="0" :precision="0" :disabled="readonly" placeholder="1" :aria-label="tm('kizPerCode')" :class="tall" data-f="marking-default-kiz" @update:value="setDefaultKiz" @focus="endKizInput" @blur="endKizInput" />
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ZCheckbox :checked="defaults.aggregated" :disabled="readonly" data-f="marking-default-aggregated" @update:checked="setDefault('aggregated', $event)">{{ tm('aggregated') }}</ZCheckbox>
          <ZCheckbox :checked="defaults.afterRelease" :disabled="readonly" data-f="marking-default-after" @update:checked="setAfter">{{ tm('afterRelease') }}</ZCheckbox>
        </div>
        <p v-if="defaults.afterRelease" class="m-0 text-xs text-gold-ink" data-markings-after-note>{{ tm('afterReleaseNote') }}</p>
        <p v-if="markings.length" class="m-0 flex flex-wrap gap-x-1.5 text-xs text-ink-2" data-markings-totals>
          <span>{{ tm('totals', { codes: totals.codes, kiz: totals.kiz }) }}</span>
          <span v-if="totals.custom">· {{ tm('customCount', { n: totals.custom }) }}</span>
          <span v-if="totals.bad" class="text-gold-ink" data-markings-bad>· {{ tm('problemsCount', { n: totals.bad }) }}</span>
          <span v-if="totals.blanks" class="text-gold-ink" data-markings-blanks>· {{ tm('blankRows', { n: totals.blanks }) }}</span>
        </p>
        <p v-if="applied" class="m-0 text-xs text-muted" role="status" data-markings-applied>{{ tm('appliedTo', { n: applied }) }}</p>
      </section>

      <p v-if="!markings.length" class="m-0 text-[13px] text-muted" data-markings-empty>{{ tm('empty') }}</p>
      <template v-else>
        <div v-for="{ m, i: mi } in shown" :key="mi" class="flex flex-col gap-1.5 rounded-row border border-line p-2" :data-marking-row="mi">
          <div class="flex items-center gap-2">
            <span class="w-8 shrink-0 text-right font-mono text-xs text-muted" aria-hidden="true">{{ mi + 1 }}</span>
            <ZInput
              v-uppercase
              :value="m.number ?? ''"
              mono
              autocomplete="off"
              :maxlength="KIZ_NUMBER_MAX"
              :disabled="readonly"
              :placeholder="tm('number')"
              :aria-label="tm('numberRow', { n: mi + 1 })"
              :aria-describedby="problemOf(m) ? `marking-${index}-${mi}-problem` : undefined"
              :class="['min-w-0 flex-1', tall]"
              :data-f="`marking-${mi}-number`"
              @update:value="setNumber(m, $event)"
              @press-enter="onEnter(mi)"
              @paste="onPaste(mi, $event)"
            />
            <div class="flex shrink-0 items-center">
              <button
                v-if="!readonly"
                type="button"
                :class="[iconBtn, 'hover:text-ink']"
                :aria-label="tm('customRow', { n: mi + 1 })"
                :title="tm('custom')"
                :aria-expanded="isOpen(m)"
                :data-marking-edit="mi"
                @click="toggle(m)"
              >
                <PhGearSix :size="16" aria-hidden="true" />
              </button>
              <button v-if="!readonly" type="button" :class="[iconBtn, 'hover:text-danger']" :aria-label="tm('removeRow', { n: mi + 1 })" :title="tm('remove')" :data-marking-remove="mi" @click="remove(m)">
                <PhX :size="16" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div v-if="isCustom(m)" class="flex min-w-0 pl-10">
            <ZTag tone="info" size="sm" class="max-w-full min-w-0" :title="customText(m)" :data-marking-custom="mi">
              <span class="truncate">{{ tm('customBadge') }}: {{ customText(m) }}</span>
            </ZTag>
          </div>
          <span v-if="problemOf(m)" :id="`marking-${index}-${mi}-problem`" class="pl-10 text-xs text-gold-ink" :data-marking-problem="mi">
            {{ problemText(problemOf(m)!) }}
          </span>
          <div v-if="isOpen(m)" class="flex flex-col gap-2 pl-10" :data-marking-fields="mi">
            <div class="grid grid-cols-2 gap-2 @xl:grid-cols-[repeat(3,minmax(0,9rem))_8.5rem]">
              <div :class="fieldCell">
                <span :class="fieldLabel">{{ tm('levelShort') }}</span>
                <ZSelect :value="m.levelCode || null" :options="withValue(levelOptions, m.levelCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('levelShort')" :aria-label="tm('level')" popup-width="300px" :class="tall" :data-f="`marking-${mi}-level`" @update:value="setRow(m, 'levelCode', str($event))">
                  <template #option="{ option }">{{ option.name }}</template>
                </ZSelect>
              </div>
              <div :class="fieldCell">
                <span :class="fieldLabel">{{ tm('applicationShort') }}</span>
                <ZSelect :value="m.idApplicationCode || null" :options="withValue(applicationOptions, m.idApplicationCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('applicationShort')" :aria-label="tm('application')" popup-width="300px" :class="tall" :data-f="`marking-${mi}-application`" @update:value="setRow(m, 'idApplicationCode', str($event))">
                  <template #option="{ option }">{{ option.name }}</template>
                </ZSelect>
              </div>
              <div :class="fieldCell">
                <span :class="fieldLabel">{{ tm('typeShort') }}</span>
                <ZSelect :value="m.idTypeCode || null" :options="withValue(typeOptions, m.idTypeCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('typeShort')" :aria-label="tm('type')" popup-width="280px" :class="tall" :data-f="`marking-${mi}-type`" @update:value="setRow(m, 'idTypeCode', str($event))">
                  <template #option="{ option }">{{ option.name }}</template>
                </ZSelect>
              </div>
              <div :class="fieldCell">
                <span :class="fieldLabel">{{ tm('kiz') }}</span>
                <ZNumber :value="m.kizCount ?? null" :min="0" :precision="0" :disabled="readonly" placeholder="0" :aria-label="tm('kiz')" :class="tall" :data-f="`marking-${mi}-kiz`" @update:value="setRow(m, 'kizCount', $event)" />
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
              <ZCheckbox :checked="!!m.aggregated" :disabled="readonly" :data-f="`marking-${mi}-aggregated`" @update:checked="setRow(m, 'aggregated', $event)">{{ tm('aggregated') }}</ZCheckbox>
              <ZButton v-if="!readonly && isCustom(m)" variant="ghost" size="sm" class="max-sm:h-11" :data-marking-reset="mi" @click="reset(m)">
                <PhArrowCounterClockwise :size="14" aria-hidden="true" />{{ tm('resetToDefaults') }}
              </ZButton>
            </div>
          </div>
        </div>
        <div v-if="hidden" class="flex items-center gap-3 text-[13px] text-muted">
          {{ tm('hiddenRows', { n: hidden }) }}
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-markings-more @click="limit += MORE">{{ tm('showMore', { n: Math.min(MORE, hidden) }) }}</ZButton>
        </div>
      </template>

      <div v-if="!readonly && pasting" class="flex flex-col gap-2 rounded-row border border-line p-2" data-markings-paste>
        <ZTextarea
          v-model:value="pasteText"
          :rows="4"
          :aria-label="tm('pasteLabel')"
          :placeholder="tm('pastePlaceholder')"
          class="font-mono"
          data-f="markings-paste"
          @keydown.ctrl.enter.prevent="applyPaste"
          @keydown.meta.enter.prevent="applyPaste"
          @keydown.esc.prevent="cancelPaste"
        />
        <div class="flex flex-wrap items-center gap-2">
          <ZButton size="sm" class="max-sm:h-11" data-markings-paste-apply @click="applyPaste">{{ tm('pasteApply') }}</ZButton>
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-markings-paste-cancel @click="cancelPaste">{{ tm('pasteCancel') }}</ZButton>
          <span class="text-xs text-muted">{{ tm('pasteHint') }}</span>
        </div>
      </div>
      <div v-else-if="!readonly" class="flex flex-wrap items-center gap-2">
        <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-markings-add @click="add">
          <PhPlus :size="14" aria-hidden="true" />{{ tm('add') }}
        </ZButton>
        <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-markings-paste-open @click="openPaste">
          <PhClipboardText :size="14" aria-hidden="true" />{{ tm('paste') }}
        </ZButton>
        <ZUpload accept=".xlsx,.xls" :before-upload="importExcel" :loading="importing" button-variant="ghost" button-size="sm" class="max-sm:[&_button]:h-11" data-markings-excel>
          <template #icon><PhFileXls :size="14" aria-hidden="true" /></template>
          {{ tm('excel') }}
        </ZUpload>
        <span class="text-xs text-muted">{{ tm('excelFormat') }}</span>
      </div>
    </div>

    <KizExcelModal
      v-if="excel"
      v-model:open="excelOpen"
      :file-name="excel.fileName"
      :sheets="excel.sheets"
      :scan="excel.scan"
      :defaults="defaults"
      :goods="model.items.value"
      :current-index="index"
      :existing="excel.existing"
      @apply="onExcelApply"
    />
  </div>
</template>
