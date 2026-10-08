<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import { REESTR_COLUMN_KEYS, type ReestrColumnKey } from '@/types/api'
import { parseNumber } from '@/ui/number'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import { useRecordRefs } from './refs'
import { boxCtl, ctl, grid } from './ui'

// Раздел «Строка реестра» (разбор §2.1, §2.2): 15 колонок реестра и группа «ЖДН». Ключи data — русские названия
// колонок, не меняются; подписи — из i18n. Поля пишут прямо в черновик.
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()

/** Ключ data → ключ подписи broker.transitRecord.row.*. */
const LABEL_KEY: Record<ReestrColumnKey, string> = {
  '№': 'number',
  'Дата': 'date',
  'Контейнер': 'container',
  'Получатель': 'consignee',
  'Станция назначения': 'destinationStation',
  'Отправитель': 'shipper',
  'Отправка': 'shipmentInfo',
  'Груз': 'cargo',
  'Подкод': 'subcode',
  'Код ТНВЭД': 'tnved',
  'Количество мест': 'packagesCount',
  'Вес': 'weight',
  'ТД': 'customsDeclaration',
  'Кол-во ТД': 'customsDeclarationCount',
  'Количество доп.листов': 'supplementalSheets',
}
const NUMBER_KEYS = new Set<string>(['Количество мест', 'Вес', 'Кол-во ТД', 'Количество доп.листов'])
const MONO_KEYS = new Set<string>(['№', 'Контейнер', 'Подкод', 'Код ТНВЭД', 'ТД'])
const label = (key: ReestrColumnKey) => t(`broker.transitRecord.row.${LABEL_KEY[key]}`)

const refs = useRecordRefs()
void refs.ensure('stations')


const text = (key: string): string | null => props.draft.fields[key] ?? null
const setText = (key: string, v: unknown) => {
  props.draft.fields[key] = v === null || v === undefined || v === '' ? null : String(v)
}

// Числа лежат в data строкой («570.5»; сервер примет и запятую). Не число («12 шт» из старой таблицы) — показываем
// текстом, чтобы значение не пропало с экрана.
const numberOf = (key: string): number | null => {
  const v = text(key)
  return v === null || v.trim() === '' ? null : parseNumber(v)
}
const isNumeric = (key: string): boolean => {
  const v = text(key)
  return v === null || v.trim() === '' || parseNumber(v) !== null
}
const setNumber = (key: string, n: number | null) => { props.draft.fields[key] = n === null ? null : String(n) }

const TNVED_FORMAT = /^\d{10}$/
const tnvedError = (): string | undefined => {
  const v = (text('Код ТНВЭД') ?? '').trim()
  return v !== '' && !TNVED_FORMAT.test(v) ? t('broker.transitRecord.row.tnvedFormat') : undefined
}
</script>

<template>
  <RecordSection id="row" :title="t('broker.transitRecord.sections.row')">
    <div class="flex flex-col gap-6">
      <div :class="grid" data-row-grid>
        <ZField v-for="key in REESTR_COLUMN_KEYS" :key="key" :label="label(key)" :error="key === 'Код ТНВЭД' ? tnvedError() : undefined">
          <ZDate v-if="key === 'Дата'" :value="text(key)" allow-clear :disabled="readonly" :class="ctl" :data-f="key" @update:value="setText(key, $event)" />
          <ZCombobox v-else-if="key === 'Станция назначения'" :value="text(key)" :options="refs.stationOptions.value" allow-clear :disabled="readonly" :placeholder="t('broker.transitRecord.main.stationPlaceholder')" :class="boxCtl" :data-f="key" @update:value="setText(key, $event)" />
          <ZNumber v-else-if="NUMBER_KEYS.has(key) && isNumeric(key)" :value="numberOf(key)" :min="0" :disabled="readonly" :class="ctl" :data-f="key" @update:value="setNumber(key, $event)" />
          <ZInput v-else :value="text(key)" :mono="MONO_KEYS.has(key)" :maxlength="key === 'Код ТНВЭД' ? 10 : undefined" :inputmode="key === 'Код ТНВЭД' ? 'numeric' : undefined" :disabled="readonly" :class="ctl" :data-f="key" @update:value="setText(key, $event)" />
        </ZField>
      </div>

      <div role="group" aria-labelledby="row-g-zhdn" class="flex flex-col gap-3" data-row-group="zhdn">
        <h3 id="row-g-zhdn" class="m-0 text-[13px] leading-5 font-semibold text-ink-2">{{ t('broker.transitRecord.row.groupZhdn') }}</h3>
        <div :class="grid">
          <ZField :label="t('broker.transitRecord.row.seal')">
            <ZInput :value="draft.sealNumber" mono :disabled="readonly" :class="ctl" data-f="sealNumber" @update:value="draft.sealNumber = $event === '' ? null : $event" />
          </ZField>
          <ZField :label="t('broker.transitRecord.row.packagingType')">
            <ZInput :value="draft.packagingType" :disabled="readonly" :class="ctl" data-f="packagingType" @update:value="draft.packagingType = $event === '' ? null : $event" />
          </ZField>
        </div>
      </div>
    </div>
  </RecordSection>
</template>
