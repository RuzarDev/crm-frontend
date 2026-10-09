<script setup lang="ts">
import { computed, toRaw } from 'vue'
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

// Привязка прицепа к голове хранится номером (headNumber уходит на сервер), но следим за ней по строке-голове, а не по
// номеру: у двух голов может быть один номер, а номер головы в момент перенабора бывает пустым. Связь «прицеп → строка
// головы» запоминаем при первой правке; пока головы нет в списке или она стала прицепом — ищем по номеру.
const links = new WeakMap<object, Import40TransportMeans>()
const headRowOf = (t: Import40TransportMeans): Import40TransportMeans | undefined => {
  const raw = toRaw(t)
  const rowsRaw = props.rows.map((r) => toRaw(r))
  const linked = links.get(raw)
  if (linked && rowsRaw.includes(linked) && !linked.isTrailer) return linked
  const n = t.headNumber?.trim()
  const found = n ? rowsRaw.find((r) => !r.isTrailer && r.number?.trim() === n) : undefined
  if (found) links.set(raw, found)
  else links.delete(raw)
  return found
}
/** Прицепы этой головы (по строке, не по номеру). */
const trailersOf = (head: Import40TransportMeans) => {
  const h = toRaw(head)
  return props.rows.filter((t) => t.isTrailer && headRowOf(t) === h)
}
/** Голова удалена или стала прицепом — её прицепы теряют привязку. */
const detach = (head: Import40TransportMeans) => {
  for (const t of trailersOf(head)) { t.headNumber = null; links.delete(toRaw(t)) }
}

const onNumber = (m: Import40TransportMeans, v: string) => {
  if (!m.isTrailer) {
    // Связи берём до правки. Пока номер стёрт (перенабор) прицепы держат прежний номер — связь не теряется; как только
    // у головы снова есть номер, прицепы идут за ним.
    const deps = trailersOf(m)
    const n = v.trim()
    if (n) for (const t of deps) t.headNumber = n
  }
  m.number = v
}
const onHead = (m: Import40TransportMeans, v: unknown) => {
  m.headNumber = str(v)
  links.delete(toRaw(m)) // следующая проверка найдёт голову по новому номеру
}
const onRole = (m: Import40TransportMeans, v: unknown) => {
  const trailer = v === 'trailer'
  if (!!m.isTrailer === trailer) return
  if (trailer) { detach(m); m.isTrailer = true } else { m.isTrailer = false; m.headNumber = null; links.delete(toRaw(m)) }
}
const add = () => {
  props.rows.push({ number: '', typeCode: null, nationality: null, mark: null, isTrailer: false, headNumber: null })
}
const remove = (i: number) => {
  const row = props.rows[i]
  if (row && !row.isTrailer) detach(row)
  props.rows.splice(i, 1)
}

// Стабильный ключ строки (не индекс): после удаления средней остальные остаются теми же узлами, поля не перемешиваются.
const ids = new WeakMap<object, number>()
let nextId = 0
const keyOf = (m: Import40TransportMeans): number => {
  const raw = toRaw(m)
  let id = ids.get(raw)
  if (id === undefined) { id = ++nextId; ids.set(raw, id) }
  return id
}

// Автомобильные виды: пять колонок только на широкой строке, между — две строки (переключатель на всю ширину).
const gridClass = computed(() => props.road
  ? '@md:grid-cols-2 @2xl:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] @2xl:items-end'
  : '@md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] @md:items-end')
</script>

<template>
  <div class="flex flex-col gap-3" :data-transport-list="graph">
    <ul v-if="rows.length" class="m-0 flex list-none flex-col gap-3 p-0">
      <li
        v-for="(m, i) in rows"
        :key="keyOf(m)"
        class="@container rounded-row border border-line bg-canvas p-3"
        :data-transport-row="graph"
        :data-role="m.isTrailer ? 'trailer' : 'head'"
      >
        <div :class="['grid grid-cols-1 gap-x-3 gap-y-3', gridClass]">
          <ZSegmented
            v-if="road"
            :value="m.isTrailer ? 'trailer' : 'head'"
            :options="roles"
            :disabled="readonly"
            :aria-label="t('broker.dt.transport.role')"
            class="@md:col-span-2 @2xl:col-span-1" data-role-switch
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
              @update:value="(v: unknown) => onHead(m, v)"
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
            class="h-11 @md:size-9 @md:justify-self-end @md:px-0"
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
