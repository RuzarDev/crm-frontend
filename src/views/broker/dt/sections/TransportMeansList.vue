<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { Import40TransportMeans } from '@/types/api'
import type { ZOption } from '@/ui/options'
import { withCurrent } from '../dtOptions'

// Список транспортных средств одной графы (18 или 21). Строка: номер, тип ТС (2024), у головы — марка, у прицепа —
// «К голове» (из голов этого же списка); для автомобильных видов (30/31/32) — переключатель «Голова / Прицеп».
// Страны регистрации в строке нет: в XML и бланк уходит одна страна на графу (поле над списком), страну ТС по
// отдельности выгрузка не пишет. Список правится на месте (массив формы), как и остальные разделы страницы.
const props = defineProps<{
  rows: Import40TransportMeans[]
  /** Автомобильный вид (30/31/32): есть голова/прицеп. */
  road: boolean
  readonly: boolean
  typeOptions: ZOption[]
  markOptions: ZOption[]
  /** Номер графы — для data-атрибутов строк и подписей кнопок. */
  graph: '18' | '21'
  /** Без кнопки добавления (ЖД: в гр. 21 только убрать старое). */
  hideAdd?: boolean
}>()
const { t } = useI18n()

const roles = computed<ZOption[]>(() => [
  { value: 'head', label: t('broker.dt.transport.head') },
  { value: 'trailer', label: t('broker.dt.transport.trailer') },
])

/** Головы списка с номером: из них выбирают «К голове». */
const heads = computed<ZOption[]>(() => {
  const seen = new Set<string>()
  const out: ZOption[] = []
  for (const m of props.rows) {
    const n = m.number?.trim()
    if (!m.isTrailer && n && !seen.has(n)) { seen.add(n); out.push({ value: n, label: n }) }
  }
  return out
})

const headOf = (m: Import40TransportMeans) => withCurrent(heads.value, m.headNumber)
const typeOf = (m: Import40TransportMeans) => withCurrent(props.typeOptions, m.typeCode)
const markOf = (m: Import40TransportMeans) => withCurrent(props.markOptions, m.mark)
const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))

/** Прицепы, привязанные к номеру, теряют привязку (голова удалена или перестала быть головой). */
const detach = (number: string | null | undefined) => {
  const n = number?.trim()
  if (!n) return
  for (const r of props.rows) if (r.isTrailer && r.headNumber === n) r.headNumber = null
}
/** Номер головы поменялся — прицепы идут за ним, иначе правка опечатки рвёт привязку. */
const retarget = (from: string | null | undefined, to: string) => {
  const f = from?.trim()
  if (!f || f === to.trim()) return
  for (const r of props.rows) if (r.isTrailer && r.headNumber === f) r.headNumber = to.trim() || null
}

const onNumber = (m: Import40TransportMeans, v: string) => {
  if (!m.isTrailer) retarget(m.number, v)
  m.number = v
}
const onRole = (m: Import40TransportMeans, v: unknown) => {
  const trailer = v === 'trailer'
  if (!!m.isTrailer === trailer) return
  if (trailer) { detach(m.number); m.isTrailer = true } else { m.isTrailer = false; m.headNumber = null }
}
const add = () => {
  props.rows.push({ number: '', typeCode: null, nationality: null, mark: null, isTrailer: false, headNumber: null })
}
const remove = (i: number) => {
  const [gone] = props.rows.splice(i, 1)
  if (gone && !gone.isTrailer) detach(gone.number)
}

const gridClass = computed(() => props.road
  ? '@md:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
  : '@md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]')
</script>

<template>
  <div class="flex flex-col gap-3" :data-transport-list="graph">
    <ul v-if="rows.length" class="m-0 flex list-none flex-col gap-3 p-0">
      <li
        v-for="(m, i) in rows"
        :key="i"
        class="@container rounded-row border border-line bg-canvas p-3"
        :data-transport-row="graph"
        :data-role="m.isTrailer ? 'trailer' : 'head'"
      >
        <div :class="['grid grid-cols-1 gap-x-3 gap-y-3 @md:items-end', gridClass]">
          <ZSegmented
            v-if="road"
            :value="m.isTrailer ? 'trailer' : 'head'"
            :options="roles"
            :disabled="readonly"
            :aria-label="t('broker.dt.transport.role')"
            data-role-switch
            @update:value="(v: unknown) => onRole(m, v)"
          />
          <ZField :label="t('broker.dt.transport.number')">
            <ZInput
              v-uppercase
              mono
              :value="m.number"
              :disabled="readonly"
              :placeholder="t('broker.dt.transport.numberPlaceholder')"
              data-transport-number
              @update:value="(v: string) => onNumber(m, v)"
            />
          </ZField>
          <ZField :label="t('broker.dt.transport.type')" :validate-status="typeOf(m).unknown ? 'warning' : ''" :help="typeOf(m).unknown ? t('broker.dt.transport.notInList', { value: m.typeCode ?? '' }) : undefined">
            <ZSelect
              :value="m.typeCode || null"
              :options="typeOf(m).options"
              show-search
              allow-clear
              :disabled="readonly"
              :placeholder="t('broker.dt.transport.select')"
              popup-width="320px"
              data-transport-type
              @update:value="(v: unknown) => { m.typeCode = str(v) }"
            />
          </ZField>
          <ZField v-if="road && m.isTrailer" :label="t('broker.dt.transport.toHead')" :validate-status="headOf(m).unknown ? 'warning' : ''" :help="headOf(m).unknown ? t('broker.dt.transport.headMissing', { value: m.headNumber ?? '' }) : undefined">
            <ZSelect
              :value="m.headNumber || null"
              :options="headOf(m).options"
              allow-clear
              :disabled="readonly"
              :placeholder="t('broker.dt.transport.selectHead')"
              data-transport-head
              @update:value="(v: unknown) => { m.headNumber = str(v) }"
            />
          </ZField>
          <ZField v-else :label="t('broker.dt.transport.mark')">
            <ZSelect
              :value="m.mark || null"
              :options="markOf(m).options"
              show-search
              allow-clear
              :disabled="readonly"
              :placeholder="t('broker.dt.transport.select')"
              data-transport-mark
              @update:value="(v: unknown) => { m.mark = str(v) }"
            />
          </ZField>
          <ZButton
            v-if="!readonly"
            variant="danger-ghost"
            class="h-11 @md:size-9 @md:px-0"
            :aria-label="t('common.delete')"
            :title="t('common.delete')"
            data-transport-remove
            @click="remove(i)"
          >
            <PhX :size="16" aria-hidden="true" />
            <span class="@md:hidden">{{ t('common.delete') }}</span>
          </ZButton>
        </div>
      </li>
    </ul>
    <p v-else class="m-0 text-sm text-muted">{{ t('broker.dt.transport.empty') }}</p>

    <div v-if="!readonly && !hideAdd" class="flex">
      <ZButton variant="ghost" class="max-sm:h-11" data-transport-add @click="add">
        <PhPlus :size="16" aria-hidden="true" />{{ t('broker.dt.transport.add') }}
      </ZButton>
    </div>
  </div>
</template>
