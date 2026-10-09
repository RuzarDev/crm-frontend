<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFileXls, PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { vUppercase } from '@/directives/uppercase'
import { message } from '@/ui/message'
import { loadXlsx } from '@/utils/xlsx'
import type { Import40GoodsMarking } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { cn } from '@/ui/cn'
import { parseMarkingsSheet } from './markingsExcel'
import type { GoodsSectionProps } from './types'

// «Маркировка» (гр. 31.13, коллекция строк): номер (код идентификации), уровень, идентификатор применения, вид средства
// идентификации, количество КИЗ, агрегированная упаковка, маркировка после выпуска; импорт из Excel — формат без шапки
// как раньше (markingsExcel.ts), строки добавляются в конец. Справочники кодов — те же, что в старой карточке (Решение 257 /
// окно КЕДЕН). Не поля платежей. Строк бывает сотни (коды из Excel) — показываем первые 10, дальше «Показать ещё».
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.markings.${key}`, p ?? {})

const PAGE = 10
const MORE = 50
const limit = ref(PAGE)
const markings = computed(() => props.item.markings ?? [])
const shown = computed(() => markings.value.slice(0, limit.value))
const hidden = computed(() => Math.max(0, markings.value.length - shown.value.length))

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
const set = <K extends keyof Import40GoodsMarking>(m: Import40GoodsMarking, key: K, v: Import40GoodsMarking[K]) => { m[key] = v }

const emptyMarking = (): Import40GoodsMarking => ({
  markingAfterRelease: false, kizCount: null, levelCode: null, idTypeCode: null, idApplicationCode: null, number: null, aggregated: false,
})
const list = (): Import40GoodsMarking[] => {
  const g = props.item
  g.markings ??= []
  return g.markings
}
const add = () => {
  list().push(emptyMarking())
  limit.value = Math.max(limit.value, markings.value.length)
}
const remove = (m: Import40GoodsMarking) => {
  const arr = list()
  const i = arr.indexOf(m)
  if (i >= 0) arr.splice(i, 1)
}

const importing = ref(false)
const importExcel = async (file: File): Promise<boolean> => {
  importing.value = true
  try {
    const XLSX = await loadXlsx()
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) { message.warning(tm('excelNoSheets')); return false }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null, raw: true })
    const parsed = parseMarkingsSheet(rows)
    if (!parsed.length) { message.warning(tm('excelNoRows')); return false }
    list().push(...parsed)
    message.success(tm('excelDone', { n: parsed.length }))
  } catch {
    message.error(tm('excelFailed'))
  } finally {
    importing.value = false
  }
  return false
}

const head = 'hidden gap-2 text-xs text-muted @xl:grid @xl:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem]'
const line1 = 'grid grid-cols-3 gap-2 @xl:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem]'
// Узко (нет строки заголовков) — короткая подпись над каждым списком.
const cell = 'flex min-w-0 flex-col gap-1'
const cellLabel = 'text-xs text-muted @xl:hidden'
const tall = 'max-sm:h-11'
const removeBtn = cn(
  'ml-auto inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-danger focus-visible:shadow-focus max-sm:size-11',
)
</script>

<template>
  <div class="flex flex-col gap-3" data-goods-markings-section>
    <p class="m-0 text-xs text-muted">{{ tm('hint') }}</p>

    <div class="flex flex-col gap-2" data-graph="31" data-goods-field="markings" :data-goods-index="index">
      <p v-if="!markings.length" class="m-0 text-[13px] text-muted" data-markings-empty>{{ tm('empty') }}</p>
      <template v-else>
        <div :class="head" aria-hidden="true">
          <span>{{ tm('number') }}</span><span>{{ tm('level') }}</span><span>{{ tm('application') }}</span><span>{{ tm('type') }}</span>
        </div>
        <div v-for="(m, mi) in shown" :key="mi" class="flex flex-col gap-2 rounded-row border border-line p-2" :data-marking-row="mi">
          <div :class="line1">
            <ZInput v-uppercase :value="m.number ?? ''" mono :maxlength="100" :disabled="readonly" :placeholder="tm('number')" :aria-label="tm('number')" :class="['col-span-3 @xl:col-span-1', tall]" :data-f="`marking-${mi}-number`" @update:value="set(m, 'number', $event.trim() ? $event : null)" />
            <div :class="cell">
              <span :class="cellLabel">{{ tm('levelShort') }}</span>
              <ZSelect :value="m.levelCode || null" :options="withValue(levelOptions, m.levelCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('levelShort')" :aria-label="tm('level')" popup-width="300px" :class="tall" :data-f="`marking-${mi}-level`" @update:value="set(m, 'levelCode', str($event))">
                <template #option="{ option }">{{ option.name }}</template>
              </ZSelect>
            </div>
            <div :class="cell">
              <span :class="cellLabel">{{ tm('applicationShort') }}</span>
              <ZSelect :value="m.idApplicationCode || null" :options="withValue(applicationOptions, m.idApplicationCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('applicationShort')" :aria-label="tm('application')" popup-width="300px" :class="tall" :data-f="`marking-${mi}-application`" @update:value="set(m, 'idApplicationCode', str($event))">
                <template #option="{ option }">{{ option.name }}</template>
              </ZSelect>
            </div>
            <div :class="cell">
              <span :class="cellLabel">{{ tm('typeShort') }}</span>
              <ZSelect :value="m.idTypeCode || null" :options="withValue(typeOptions, m.idTypeCode)" option-filter-prop="search" allow-clear :disabled="readonly" :placeholder="tm('typeShort')" :aria-label="tm('type')" popup-width="280px" :class="tall" :data-f="`marking-${mi}-type`" @update:value="set(m, 'idTypeCode', str($event))">
                <template #option="{ option }">{{ option.name }}</template>
              </ZSelect>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label class="flex items-center gap-2 text-[13px] text-ink-2">
              {{ tm('kiz') }}
              <ZNumber :value="m.kizCount ?? null" :min="0" :precision="0" :disabled="readonly" placeholder="0" :class="['w-24', tall]" :data-f="`marking-${mi}-kiz`" @update:value="set(m, 'kizCount', $event)" />
            </label>
            <ZCheckbox :checked="!!m.aggregated" :disabled="readonly" :data-f="`marking-${mi}-aggregated`" @update:checked="set(m, 'aggregated', $event)">{{ tm('aggregated') }}</ZCheckbox>
            <ZCheckbox :checked="!!m.markingAfterRelease" :disabled="readonly" :data-f="`marking-${mi}-after`" @update:checked="set(m, 'markingAfterRelease', $event)">{{ tm('afterRelease') }}</ZCheckbox>
            <button v-if="!readonly" type="button" :class="removeBtn" :aria-label="tm('remove')" :title="tm('remove')" :data-marking-remove="mi" @click="remove(m)">
              <PhX :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div v-if="hidden" class="flex items-center gap-3 text-[13px] text-muted">
          {{ tm('hiddenRows', { n: hidden }) }}
          <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-markings-more @click="limit += MORE">{{ tm('showMore', { n: Math.min(MORE, hidden) }) }}</ZButton>
        </div>
      </template>

      <div v-if="!readonly" class="flex flex-wrap items-center gap-2">
        <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-markings-add @click="add">
          <PhPlus :size="14" aria-hidden="true" />{{ tm('add') }}
        </ZButton>
        <ZUpload accept=".xlsx,.xls" :before-upload="importExcel" :loading="importing" button-variant="ghost" button-size="sm" class="max-sm:[&_button]:h-11" data-markings-excel>
          <template #icon><PhFileXls :size="14" aria-hidden="true" /></template>
          {{ tm('excel') }}
        </ZUpload>
        <span class="text-xs text-muted">{{ tm('excelFormat') }}</span>
      </div>
    </div>
  </div>
</template>
