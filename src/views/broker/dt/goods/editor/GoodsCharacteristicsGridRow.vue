<script setup lang="ts">
import { nextTick, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCopy, PhX } from '@phosphor-icons/vue'
import { useTroisCheck } from '@/composables/useTroisCheck'
import { cn } from '@/ui/cn'
import { formatNumberIn } from '@/ui/number'
import { CHARACTERISTIC_FIELDS, CHARACTERISTICS_MAX_ROWS, type CharacteristicField, type CharacteristicFieldDef, type GoodsRowValue } from './characteristics'
import { parseCellNumber } from './characteristicsPaste'
import { okeiCode, okeiFromText, okeiLabel, okeiShort } from './okei'

// Строка таблицы гр. 31 (GoodsCharacteristicsGrid): своя отрисовка — правка ячейки перерисовывает только эту строку, а не
// всё окно таблицы (500 строк). Ячейки — простые <input>: текст ЗАГЛАВНЫМИ; число и единица — черновик, пока ячейка в
// фокусе (как набрано; не разобралось — рамка ошибки, значение строки не меняется), вне фокуса — формат по языку и кр.
// наименование единицы. Клавиши — у таблицы (по data-row / data-col).
const props = defineProps<{
  r: GoodsRowValue
  /** Позиция строки (с 0). */
  i: number
  readonly: boolean
  /** Строка, где курсор (подсветка №). */
  active: boolean
  canAdd: boolean
  /** Подсказки пустых ячеек единственной строки (гр. 41 / гр. 42); у других строк — null. */
  placeholders: Partial<Record<CharacteristicField, string>> | null
  template: string
  stickyLeft: string
  height: number
  colCount: number
  /** id списка единиц ОКЕИ (<datalist>). */
  listId: string
}>()
const emit = defineEmits<{ copy: [i: number]; remove: [i: number] }>()
const { t, locale } = useI18n()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.chars.${key}`, p ?? {})
const trois = useTroisCheck()
const FIELDS = CHARACTERISTIC_FIELDS

const num = (v: number | null | undefined) => (v == null ? '' : formatNumberIn(locale.value, v, 6))
const editNum = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', locale.value === 'en' ? '.' : ','))
const unitText = (code: string | null | undefined) => (code ? okeiShort(code) ?? okeiCode(code) : '')

interface Draft { key: CharacteristicField; text: string; bad: boolean }
const draft = shallowRef<Draft | null>(null)
const draftOf = (key: CharacteristicField) => (draft.value?.key === key ? draft.value : null)
const cellValue = (c: CharacteristicFieldDef): string => {
  const d = draftOf(c.key)
  if (d) return d.text
  const v = props.r[c.key]
  if (c.kind === 'number') return num(v as number | null | undefined)
  if (c.kind === 'unit') return unitText(v as string | null | undefined)
  return (v as string | null | undefined) ?? ''
}
const troisHit = (name: string | null | undefined) =>
  !!trois?.resultFor(name)?.matches?.some((m) => m.match === 'exact' && m.isActive)
const cellTitle = (c: CharacteristicFieldDef): string | undefined => {
  if (c.kind === 'unit') return props.r.unitCode ? okeiLabel(props.r.unitCode) : tc('unitTyping')
  if (c.key === 'tradeMarkName' && troisHit(props.r.tradeMarkName)) return tc('troisHit')
  const v = props.r[c.key]
  return typeof v === 'string' && v.length > 20 ? v : undefined
}
const invalid = (c: CharacteristicFieldDef) => !!draftOf(c.key)?.bad

const onFocus = (c: CharacteristicFieldDef, e: FocusEvent) => {
  if (c.kind === 'text') return
  const el = e.target as HTMLInputElement
  const text = c.kind === 'number' ? editNum(props.r[c.key] as number | null | undefined) : unitText(props.r.unitCode)
  draft.value = { key: c.key, text, bad: false }
  // Значение в поле сменилось (формат → как набирать): выделить всё — набор заменяет, как в таблице.
  void nextTick(() => { if (document.activeElement === el) el.select() })
}
const onBlur = (c: CharacteristicFieldDef) => { if (draftOf(c.key)) draft.value = null }
const onInput = (c: CharacteristicFieldDef, e: Event) => {
  if (props.readonly) return
  const r = props.r as Record<string, unknown>
  const el = e.target as HTMLInputElement
  if (c.kind === 'text') {
    const up = el.value.toLocaleUpperCase('ru-RU')
    if (up !== el.value) {
      const at = el.selectionStart
      el.value = up
      if (at != null) el.setSelectionRange(at, at)
    }
    r[c.key] = up.trim() ? up : null
    return
  }
  const text = el.value
  let bad = false
  if (!text.trim()) r[c.key] = null
  else if (c.kind === 'number') {
    const n = parseCellNumber(text)
    if (n == null) bad = true
    else r[c.key] = n
  } else {
    const code = okeiFromText(text)
    if (code) r.unitCode = code
    else bad = true
  }
  draft.value = { key: c.key, text, bad }
}

const bodyCell = 'relative min-w-0 border-r border-line last:border-r-0'
const input = (c: CharacteristicFieldDef, bad: boolean) => cn(
  'block h-full w-full min-w-0 border-0 bg-transparent px-2 font-sans text-[13px] text-ink outline-hidden placeholder:text-muted',
  'focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--color-zircon-ink)] read-only:cursor-default',
  c.kind !== 'text' && 'tabular-nums',
  c.kind === 'number' && 'text-right',
  bad && 'shadow-[inset_0_0_0_2px_var(--color-danger)] focus:shadow-[inset_0_0_0_2px_var(--color-danger)]',
)
const iconBtn = cn(
  'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40',
)
</script>

<template>
  <div
    role="row"
    :aria-rowindex="i + 2"
    :aria-selected="active || undefined"
    class="grid border-b border-line"
    :style="{ gridTemplateColumns: template, height: `${height}px` }"
    :data-char-row="i"
  >
    <div
      role="rowheader"
      aria-colindex="1"
      :class="[bodyCell, 'sticky left-0 z-[5] flex items-center justify-end pr-2 text-[13px] tabular-nums', active ? 'bg-zircon-soft text-zircon-ink' : 'bg-surface text-muted']"
    >{{ i + 1 }}</div>
    <div
      v-for="(c, k) in FIELDS"
      :key="c.key"
      role="gridcell"
      :aria-colindex="k + 2"
      :class="[bodyCell, c.key === 'name' && 'sticky z-[5] bg-surface shadow-[1px_0_0_var(--color-line-strong)]', c.key === 'tradeMarkName' && troisHit(r.tradeMarkName) && 'bg-gold-soft']"
      :style="c.key === 'name' ? { left: stickyLeft } : undefined"
    >
      <input
        :class="input(c, invalid(c))"
        :value="cellValue(c)"
        :placeholder="placeholders?.[c.key]"
        :title="cellTitle(c)"
        :maxlength="c.max"
        :readonly="readonly"
        :inputmode="c.kind === 'number' ? 'decimal' : undefined"
        :list="c.kind === 'unit' && !readonly ? listId : undefined"
        :aria-label="tc('cellLabel', { col: tc(`col.${c.f}`), n: i + 1 })"
        :aria-invalid="invalid(c) || undefined"
        autocomplete="off"
        spellcheck="false"
        :data-row="i"
        :data-col="c.f"
        :data-f="`char-${i}-${c.f}`"
        @focus="onFocus(c, $event)"
        @blur="onBlur(c)"
        @input="onInput(c, $event)"
      >
    </div>
    <div v-if="!readonly" role="gridcell" :aria-colindex="colCount" :class="[bodyCell, 'flex items-center justify-center gap-0.5']">
      <button
        type="button"
        :class="iconBtn"
        :disabled="!canAdd"
        :aria-label="tc('copyRow', { n: i + 1 })"
        :title="canAdd ? tc('copyRow', { n: i + 1 }) : tc('capReached', { max: CHARACTERISTICS_MAX_ROWS })"
        :data-row="i"
        data-col="copy"
        :data-char-copy="i"
        @click="emit('copy', i)"
      ><PhCopy :size="15" aria-hidden="true" /></button>
      <button
        type="button"
        :class="[iconBtn, 'hover:text-danger']"
        :aria-label="tc('remove', { n: i + 1 })"
        :title="tc('remove', { n: i + 1 })"
        :data-row="i"
        data-col="remove"
        :data-char-remove="i"
        @click="emit('remove', i)"
      ><PhX :size="15" aria-hidden="true" /></button>
    </div>
  </div>
</template>
