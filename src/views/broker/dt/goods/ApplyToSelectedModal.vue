<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40GoodsItemInput } from '@/types/api'
import { BULK_GROUPS, bulkPatchFrom, type BulkField, type BulkGroup, type BulkPatch } from './goodsBulk'
import { formatItemNumbers } from './goodsList'
import { pinPreferences, useKedenLists, type KedenListField } from './useKedenLists'

// «Применить к выбранным…» (доска DtGoods): группы полей (goodsBulk.BULK_GROUPS) — отмеченные группы заменяют
// значения у всех выбранных товаров (пустое — очищает). «Заполнить как у товара» берёт значения из товара-образца
// (вместо прежних «Копировать ОИС/МНР» и «Проставить месяцы всем»). Коды гр. 33 (нетарифное регулирование)
// выбираются только из подсказок КЕДЕН в карточке товара — здесь их можно лишь взять у товара-образца.
// гр. 36, гр. 37 и особенность перемещения сужаются списками КЕДЕН, как в редакторе товара (useKedenLists): ключ —
// направление гр. 1 + процедура, которую получат товары: отмечена группа «Процедура» — её значение (пустое — процедура ДТ), иначе
// общая процедура выбранных товаров (своя или ДТ) — если у всех одна, иначе процедура ДТ. Код вне списка не удаляется —
// подсвечивается.
const props = defineProps<{
  open: boolean
  /** Позиции выбранных товаров (с 0). */
  indexes: number[]
  goods: readonly Import40GoodsItemInput[]
  countryOptions: { value: string; label: string; alpha2?: string | null }[]
  /** гр. 1: направление и процедура ДТ — ключ списков КЕДЕН. */
  direction?: string | null
  declProcedure?: string | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; apply: [patch: BulkPatch] }>()
const { t } = useI18n()
const ta = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.apply.${key}`, p ?? {})
const classifiers = useClassifiersStore()

type Kind = 'select' | 'multi' | 'tags' | 'text' | 'number' | 'source'
interface FieldUi { kind: Kind; options?: () => ZOption[]; join?: string; upper?: boolean; mono?: boolean; keden?: KedenListField }

const classifier = (code: string) => () => classifiers.options(code)
// гр. 36: «ОО, О, Z» сверху, остальные по коду (как в карточке товара).
const pref = (code: string) => () => pinPreferences(classifiers.options(code))
const countries = () => props.countryOptions.map((c) => ({ value: c.value, label: c.label }))
const alpha2 = () => props.countryOptions.filter((c) => c.alpha2).map((c) => ({ value: c.alpha2 as string, label: `${c.alpha2} — ${c.label.replace(/^\d+\s*—\s*/, '')}` }))

const FIELD_UI: Record<BulkField, FieldUi> = {
  countryOfOrigin: { kind: 'select', options: countries },
  procedureCode: { kind: 'select', options: classifier('customs-procedures'), keden: 'procedure' },
  previousProcedureCode: { kind: 'select', options: classifier('customs-procedures'), keden: 'prev' },
  goodsMoveFeatureCode: { kind: 'select', options: classifier('movement-features'), keden: 'movement-features' },
  valuationMethodCode: { kind: 'select', options: classifier('2005') },
  prefClearanceCode: { kind: 'select', options: pref('pref-fee'), keden: 'pref-fee' },
  prefDutyCode: { kind: 'select', options: pref('pref-duty'), keden: 'pref-duty' },
  prefExciseCode: { kind: 'select', options: pref('pref-excise'), keden: 'pref-excise' },
  prefVatCode: { kind: 'select', options: pref('pref-vat'), keden: 'pref-vat' },
  oisIndicatorCode: { kind: 'select', options: classifier('ois-indicators') },
  oisRegNumber: { kind: 'text', upper: true, mono: true },
  oisCountryCode: { kind: 'select', options: alpha2 },
  restrictionMarks: { kind: 'multi', options: classifier('restriction-marks'), join: ',' },
  prohibitionCode: { kind: 'source' },
  certificationNote: { kind: 'tags', options: classifier('certification-kinds'), join: '; ' },
  tempImportMonths: { kind: 'number' },
  packageKindCode: { kind: 'select', options: classifier('2013') },
  packageAvailabilityCode: { kind: 'select', options: classifier('packaging-availability') },
}
const GROUPS = Object.keys(BULK_GROUPS) as BulkGroup[]

const checked = reactive(new Set<BulkGroup>())
const values = reactive<Record<string, unknown>>({})
const source = ref<number | null>(null)

const split = (v: unknown, sep: string) => (typeof v === 'string' ? v.split(sep.trim()).map((s) => s.trim()).filter(Boolean) : [])
/** Значения из товара (или пустые) — в поля окна. */
const fill = (g: Import40GoodsItemInput | null) => {
  const patch = g ? bulkPatchFrom(g, Object.keys(FIELD_UI) as BulkField[]) : {}
  for (const f of Object.keys(FIELD_UI) as BulkField[]) {
    const ui = FIELD_UI[f]
    const v = (patch as Record<string, unknown>)[f] ?? null
    values[f] = ui.join ? split(v, ui.join) : v
  }
}

// Открыли окно — образец: первый выбранный товар; группы не отмечены.
watch(() => props.open, (o) => {
  if (!o) return
  checked.clear()
  source.value = props.indexes[0] ?? null
  fill(source.value != null ? props.goods[source.value] ?? null : null)
}, { immediate: true })
const onSource = (v: ZOptionValue | ZOptionValue[] | null) => {
  source.value = typeof v === 'number' ? v : null
  fill(source.value != null ? props.goods[source.value] ?? null : null)
}

const sourceOptions = computed<ZOption[]>(() => props.goods.map((g, i) => {
  const text = (g.tnvedCode || g.description || '').trim()
  return { value: i, label: text ? ta('sourceOption', { n: i + 1, text }) : ta('sourceOptionBare', { n: i + 1 }) }
}))
const toggle = (g: BulkGroup, on: boolean) => { if (on) checked.add(g); else checked.delete(g) }
const groupDisabled = (g: BulkGroup) => BULK_GROUPS[g].every((f) => FIELD_UI[f].kind === 'source') && source.value == null

const numbers = computed(() => formatItemNumbers(props.indexes))
const canApply = computed(() => [...checked].some((g) => !groupDisabled(g)))

const submit = () => {
  if (!canApply.value) return
  const patch: Record<string, unknown> = {}
  for (const g of checked) {
    if (groupDisabled(g)) continue
    for (const f of BULK_GROUPS[g]) {
      const ui = FIELD_UI[f]
      const v = values[f]
      if (ui.kind === 'source') patch[f] = source.value != null ? props.goods[source.value]?.[f] ?? null : null
      else if (ui.join) patch[f] = Array.isArray(v) && v.length ? v.join(ui.join) : null
      else patch[f] = v === '' || v === undefined ? null : v
    }
  }
  emit('apply', patch as BulkPatch)
}
const setValue = (f: BulkField, v: unknown) => { values[f] = FIELD_UI[f].upper && typeof v === 'string' ? v.toUpperCase() : v }

// ---- Списки КЕДЕН ----
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const keyProcedure = computed(() => {
  const dt = text(props.declProcedure)
  // Группа «Процедура» отмечена — товары получат её значение; пустое очистит процедуру товара → ключ по процедуре ДТ.
  if (checked.has('procedure')) return text(values.procedureCode) || dt || null
  const common = new Set(props.indexes.map((i) => text(props.goods[i]?.procedureCode) || dt))
  return common.size === 1 ? [...common][0] || null : dt || null
})
const keden = useKedenLists(() => ({ direction: props.direction, procedure: keyProcedure.value }))
const optionsFor = (f: BulkField): ZOption[] => {
  const ui = FIELD_UI[f]
  const base = ui.options?.() ?? []
  return ui.keden ? keden.narrow(ui.keden, base, text(values[f]) || null) : base
}
const isOff = (f: BulkField) => {
  const field = FIELD_UI[f].keden
  return !!field && keden.offList(field, text(values[f]) || null)
}
const offStatus = (f: BulkField) => {
  const field = FIELD_UI[f].keden
  if (!field || !isOff(f)) return {}
  const help = field === 'procedure'
    ? t('broker.dt.goods.editor.prefs.offListProcedure', { direction: text(props.direction).toUpperCase() || 'ИМ' })
    : t('broker.dt.goods.editor.prefs.offList', { key: keden.keyLabel.value })
  return { validateStatus: 'warning' as const, help }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="ta('title')"
    :width="640"
    :ok-text="ta('ok')"
    :cancel-text="t('common.cancel')"
    :ok-button-props="{ disabled: !canApply }"
    destroy-on-close
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4" data-goods-apply-modal>
      <p class="m-0 rounded-row bg-gold-soft px-3 py-2 text-sm text-gold-ink" data-goods-apply-note>
        {{ ta('note', { n: indexes.length, list: numbers }) }}
      </p>
      <ZField :label="ta('source')">
        <ZSelect
          :value="source"
          :options="sourceOptions"
          show-search
          allow-clear
          :placeholder="ta('sourceNone')"
          data-goods-apply-source
          @update:value="onSource"
        />
      </ZField>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="g in GROUPS" :key="g" class="rounded-row border border-line" :data-goods-apply-group="g">
          <label class="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 text-sm font-medium text-ink">
            <ZCheckbox :checked="checked.has(g)" :disabled="groupDisabled(g)" @change="toggle(g, $event)" />
            {{ ta(`groups.${g}`) }}
          </label>
          <div v-if="checked.has(g)" class="grid grid-cols-1 gap-3 border-t border-line px-3 py-3 sm:grid-cols-2">
            <ZField v-for="f in BULK_GROUPS[g]" :key="f" :label="ta(`fields.${f}`)" v-bind="offStatus(f)" :class="FIELD_UI[f].kind === 'source' && 'sm:col-span-2'" :data-goods-field="f">
              <p v-if="FIELD_UI[f].kind === 'source'" class="m-0 text-sm text-ink-2" :data-goods-apply-field="f">
                {{ (source != null && goods[source]?.[f]) || ta('sourceEmpty') }}
                <span class="mt-1 block text-xs text-muted">{{ ta('gr33Hint') }}</span>
              </p>
              <ZNumber
                v-else-if="FIELD_UI[f].kind === 'number'"
                :value="(values[f] as number | null)"
                :min="0"
                :precision="0"
                :data-goods-apply-field="f"
                @update:value="setValue(f, $event)"
              />
              <ZInput
                v-else-if="FIELD_UI[f].kind === 'text'"
                :value="(values[f] as string | null) ?? ''"
                :mono="FIELD_UI[f].mono"
                allow-clear
                :data-goods-apply-field="f"
                @update:value="setValue(f, $event)"
              />
              <ZSelect
                v-else
                :value="(values[f] as ZOptionValue | ZOptionValue[] | null)"
                :options="optionsFor(f)"
                :status="isOff(f) ? 'warning' : ''"
                :mode="FIELD_UI[f].kind === 'multi' ? 'multiple' : FIELD_UI[f].kind === 'tags' ? 'tags' : undefined"
                show-search
                allow-clear
                :placeholder="ta('empty')"
                :data-goods-apply-field="f"
                @update:value="setValue(f, $event)"
              />
            </ZField>
          </div>
        </li>
      </ul>
    </div>
  </ZModal>
</template>
