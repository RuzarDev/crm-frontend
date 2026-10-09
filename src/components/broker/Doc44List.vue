<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRaw, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40Doc44ItemInput } from '@/types/api'
import { formatDateText } from '@/ui/date'
import type { ZOption } from '@/ui/options'

// Список «Документы гр. 44» — общий для записи транзита (доска TransitRecord, разбор §2.5), партии пакета и ДТ
// Импорт 40: таблица с правкой на месте — код (классификатор 2009, выбор подставляет вид), вид, номер, дата. Строки
// правятся прямо в переданном массиве (как раньше разделы транзита правили черновик), без своей копии. «Добавить» —
// через expose add(): кнопка живёт там, где её ждёт страница (в шапке раздела транзита, под списком в ДТ).
// В узком разделе строки — карточки с подписями полей. Порог — по ширине раздела (@container, как у GoodsCard),
// не окна: в половине редактора партии (~540px) — карточки, на странице записи 4б (~830px) — таблица.
// Два набора доп. сведений под строкой «Ещё»:
//   extended     — запись транзита: уполномоченный орган, ИД органа, номер бланка (их хранит запись реестра);
//   goodsOptions — ДТ: к каким товарам относится документ («на все» или выбранные: у ДТ связь по индексу товара) —
//                  отдельной строкой, она важна всегда; период действия и страна выдачи (alpha-2) — под «Ещё».
// Без обоих — только код, вид, номер, дата (гр. 44 партии пакета).
const props = withDefaults(defineProps<{
  items: Import40Doc44ItemInput[]
  readonly: boolean
  extended?: boolean
  /** Товары ДТ: value — индекс товара с 0, подпись «Товар N · код». Есть — документ привязывается к товарам. */
  goodsOptions?: ZOption[]
}>(), { extended: false })
const { t } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.doc44.${key}`, p ?? {})

const classifiers = useClassifiersStore()
void classifiers.load('2009').catch(() => { /* классификатор — подсказка: код и вид остаются ручным вводом */ })
// Страны (alpha-2) — только у ДТ; у записи транзита справочник стран не нужен.
const countries = props.goodsOptions ? useCountryAlpha2Options() : ref<ZOption[]>([])

// В поле — только код (колонка узкая, вид документа стоит рядом), в списке — «04021 — Инвойс…»; поиск — по обоим.
const docTypeOptions = computed<ZOption[]>(() => classifiers.options('2009').map((o) => ({ value: o.value, label: String(o.value), full: o.label })))
const fullLabel = (o: ZOption) => String(o.full ?? o.label)
const filterDocType = (input: string, o: ZOption) => fullLabel(o).toLocaleLowerCase('ru').includes(input.toLocaleLowerCase('ru'))
const filterCountry = (input: string, o: ZOption) => o.label.toLocaleLowerCase('ru').includes(input.toLocaleLowerCase('ru'))

const uid = useId()
const ids = new WeakMap<object, number>()
let nextId = 0
const keyOf = (item: Import40Doc44ItemInput): number => {
  const raw = toRaw(item)
  let id = ids.get(raw)
  if (id === undefined) {
    id = ++nextId
    ids.set(raw, id)
  }
  return id
}
const domId = (item: Import40Doc44ItemInput, field: string) => `doc44-${uid}-${keyOf(item)}-${field}`

const hasMore = computed(() => props.extended || !!props.goodsOptions)
const more = reactive(new Set<number>())
const toggleMore = (item: Import40Doc44ItemInput) => {
  const k = keyOf(item)
  if (more.has(k)) more.delete(k)
  else more.add(k)
}

/** Новая строка — только поля, которые хранит приёмник (запись реестра — своё, ДТ — своё). */
const newDoc = (): Import40Doc44ItemInput => {
  const base = { docTypeCode: null, docTypeName: null, docNumber: null, docDate: null }
  if (props.goodsOptions) {
    return { ...base, goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null }
  }
  return props.extended ? { ...base, authorizedBody: null, authorizedBodyId: null, formBlankNumber: null } : base
}

const listEl = ref<HTMLElement | null>(null)
const add = async () => {
  if (props.readonly) return
  props.items.push(newDoc())
  await nextTick()
  const rowsEls = listEl.value?.querySelectorAll<HTMLElement>('[data-doc44-row]')
  rowsEls?.[rowsEls.length - 1]?.querySelector<HTMLElement>('[data-f="docTypeCode"]')?.focus()
}
defineExpose({ add })
const remove = (item: Import40Doc44ItemInput) => {
  if (props.readonly) return
  const at = props.items.indexOf(item)
  if (at >= 0) props.items.splice(at, 1)
  more.delete(keyOf(item))
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
type StrKey = 'docTypeName' | 'docNumber' | 'authorizedBody' | 'authorizedBodyId' | 'formBlankNumber'
const setStr = (item: Import40Doc44ItemInput, key: StrKey, v: unknown) => { item[key] = str(v) }
const onCode = (item: Import40Doc44ItemInput, v: unknown) => {
  const code = str(v)
  item.docTypeCode = code
  const found = classifiers.cache['2009']?.find((c) => c.code === code)
  if (found) item.docTypeName = found.nameRu
}

// ---- Привязка к товарам ДТ ----
// goodsItemIndexes — CSV индексов («0,2»); пусто и appliesToAll=false сервер читает как «на все товары».
const goodsIndexes = (item: Import40Doc44ItemInput): number[] =>
  (item.goodsItemIndexes ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter((n) => Number.isFinite(n))
const goodsLabel = (i: number) => props.goodsOptions?.find((o) => o.value === i)?.label ?? tr('goodsN', { n: i + 1 })
/** Варианты строки: товары ДТ + индексы, которых уже нет (товар удалён) — чтобы привязка не пропадала молча. */
const goodsChoices = (item: Import40Doc44ItemInput): ZOption[] => {
  const base = props.goodsOptions ?? []
  const extra = goodsIndexes(item).filter((i) => !base.some((o) => o.value === i)).map((i) => ({ value: i, label: tr('goodsN', { n: i + 1 }) }))
  return extra.length ? [...base, ...extra] : base
}
const onGoods = (item: Import40Doc44ItemInput, v: unknown) => {
  const list = (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isFinite(n))
  item.goodsItemIndexes = list.length ? list.join(',') : null
}
const onAll = (item: Import40Doc44ItemInput, on: boolean) => {
  item.appliesToAll = on
  if (on) item.goodsItemIndexes = null // «на все» и конкретные товары взаимоисключают друг друга
}
const goodsSummary = (item: Import40Doc44ItemInput) => {
  if (item.appliesToAll) return tr('goodsAllShort')
  const list = goodsIndexes(item)
  return list.length ? list.map(goodsLabel).join(', ') : tr('goodsAllShort')
}

/** Сколько полей под «Ещё» заполнено — метка на кнопке, чтобы данные не прятались в свёрнутой строке. */
const extraKeys = computed<(keyof Import40Doc44ItemInput)[]>(() => props.goodsOptions
  ? ['docStartDate', 'docValidityDate', 'issueCountryCode']
  : props.extended ? ['authorizedBody', 'authorizedBodyId', 'formBlankNumber'] : [])
const extrasCount = (item: Import40Doc44ItemInput) => extraKeys.value.filter((k) => item[k]).length
const moreAria = (item: Import40Doc44ItemInput, n: number) => {
  const c = extrasCount(item)
  return c ? `${tr('moreLabel', { n })}, ${tr('moreFilled', { count: c })}` : tr('moreLabel', { n })
}

const extras = (item: Import40Doc44ItemInput) => extraKeys.value
  .filter((k) => item[k])
  .map((k) => `${tr(k)}: ${k === 'docStartDate' || k === 'docValidityDate' ? formatDateText(item[k] as string) : item[k]}`)
  .join(' · ')

const countryOf = (item: Import40Doc44ItemInput) => {
  const v = (item.issueCountryCode ?? '').trim()
  return !v || countries.value.some((o) => o.value === v) ? countries.value : [{ value: v, label: v }, ...countries.value]
}

const cols = '@2xl:grid-cols-[10rem_minmax(0,1.5fr)_minmax(0,1fr)_9.5rem_auto]'
const cellLabel = 'text-xs leading-4 text-ink-3 @2xl:sr-only'
const cell = 'flex min-w-0 flex-col gap-1'
const ctl = 'max-sm:h-11'
const boxCtl = 'max-sm:*:h-11'
const iconBtn = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
</script>

<template>
  <p v-if="!items.length" class="m-0 text-sm text-ink-3" data-doc44-empty>{{ tr('empty') }}</p>
  <div v-else class="@container min-w-0">
    <div ref="listEl" class="min-w-0 @2xl:overflow-hidden @2xl:rounded-row @2xl:border @2xl:border-line" data-doc44-list>
      <div
        aria-hidden="true"
        :class="['hidden gap-2 border-b border-line bg-canvas px-3 py-2 text-xs leading-4 font-medium text-ink-3 @2xl:grid', cols]"
        data-doc44-head
      >
        <span>{{ tr('code') }}</span><span>{{ tr('name') }}</span><span>{{ tr('number') }}</span><span>{{ tr('date') }}</span><span />
      </div>
      <ul role="list" class="m-0 flex list-none flex-col p-0 @max-2xl:gap-2.5">
        <li
          v-for="(item, index) in items"
          :key="keyOf(item)"
          class="flex min-w-0 flex-col @max-2xl:gap-3 @max-2xl:rounded-row @max-2xl:border @max-2xl:border-line @max-2xl:bg-surface @max-2xl:p-3 @2xl:border-t @2xl:border-line @2xl:first:border-t-0"
          data-doc44-row
        >
          <template v-if="readonly">
            <div :class="['grid grid-cols-1 gap-3 @2xl:items-center @2xl:gap-2 @2xl:px-3 @2xl:py-3', cols]">
              <div :class="cell"><span :class="cellLabel">{{ tr('code') }}</span><span class="font-mono text-sm text-ink">{{ item.docTypeCode || '—' }}</span></div>
              <div :class="cell"><span :class="cellLabel">{{ tr('name') }}</span><span class="text-sm break-words text-ink">{{ item.docTypeName || '—' }}</span></div>
              <div :class="cell"><span :class="cellLabel">{{ tr('number') }}</span><span class="font-mono text-sm break-words text-ink">{{ item.docNumber || '—' }}</span></div>
              <div :class="cell"><span :class="cellLabel">{{ tr('date') }}</span><span class="text-sm text-ink tabular-nums">{{ formatDateText(item.docDate) || '—' }}</span></div>
              <span />
            </div>
            <p v-if="goodsOptions" class="m-0 text-xs leading-5 text-ink-3 @2xl:-mt-1.5 @2xl:px-3" data-doc44-goods-text>{{ tr('goods') }}: {{ goodsSummary(item) }}</p>
            <p v-if="extras(item)" class="m-0 text-xs leading-5 text-ink-3 @2xl:-mt-1.5 @2xl:px-3 @2xl:pb-3" data-doc44-extras>{{ extras(item) }}</p>
          </template>

          <template v-else>
            <div :class="['grid grid-cols-1 gap-3 @2xl:items-center @2xl:gap-2 @2xl:px-3 @2xl:py-2', cols]">
              <div :class="cell">
                <label :for="domId(item, 'code')" :class="cellLabel">{{ tr('code') }}</label>
                <ZSelect
                  :id="domId(item, 'code')"
                  :value="item.docTypeCode"
                  :options="docTypeOptions"
                  show-search
                  allow-clear
                  :placeholder="tr('code')"
                  :popup-width="420"
                  :filter-option="filterDocType"
                  :class="boxCtl"
                  data-f="docTypeCode"
                  @update:value="onCode(item, $event)"
                >
                  <template #option="{ option }">{{ fullLabel(option) }}</template>
                </ZSelect>
              </div>
              <div :class="cell">
                <label :for="domId(item, 'name')" :class="cellLabel">{{ tr('name') }}</label>
                <ZInput :id="domId(item, 'name')" :value="item.docTypeName" :maxlength="1000" :class="ctl" data-f="docTypeName" @update:value="setStr(item, 'docTypeName', $event)" />
              </div>
              <div :class="cell">
                <label :for="domId(item, 'number')" :class="cellLabel">{{ tr('number') }}</label>
                <ZInput :id="domId(item, 'number')" :value="item.docNumber" mono :maxlength="256" :class="ctl" data-f="docNumber" @update:value="setStr(item, 'docNumber', $event)" />
              </div>
              <div :class="cell">
                <label :for="domId(item, 'date')" :class="cellLabel">{{ tr('date') }}</label>
                <ZDate :id="domId(item, 'date')" :value="item.docDate" allow-clear :class="ctl" data-f="docDate" @update:value="item.docDate = $event" />
              </div>
              <div class="flex items-center justify-end gap-1 @max-2xl:justify-between">
                <ZButton
                  v-if="hasMore"
                  variant="ghost"
                  size="sm"
                  class="max-sm:h-11 max-sm:px-3"
                  :aria-expanded="more.has(keyOf(item)) ? 'true' : 'false'"
                  :aria-controls="domId(item, 'more')"
                  :aria-label="moreAria(item, index + 1)"
                  data-doc44-more
                  @click="toggleMore(item)"
                >
                  {{ tr('more') }}
                  <span
                    v-if="extrasCount(item)"
                    aria-hidden="true"
                    class="rounded-pill bg-zircon-soft px-1.5 text-xs leading-4 font-semibold text-zircon-ink tabular-nums"
                    data-doc44-more-count
                  >{{ extrasCount(item) }}</span>
                  <PhCaretDown :size="14" aria-hidden="true" class="transition-transform duration-150 motion-reduce:transition-none" :class="more.has(keyOf(item)) && 'rotate-180'" />
                </ZButton>
                <button
                  type="button"
                  :class="iconBtn"
                  :aria-label="tr('deleteLabel', { n: index + 1 })"
                  data-doc44-delete
                  @click="remove(item)"
                ><PhX :size="16" aria-hidden="true" /></button>
              </div>
            </div>

            <!-- ДТ: к каким товарам относится документ. Пусто и без «на все» — сервер читает как «на все». -->
            <div v-if="goodsOptions" class="flex min-w-0 flex-col gap-2 @2xl:px-3 @2xl:pb-2 @3xl:flex-row @3xl:items-start" data-doc44-goods>
              <ZCheckbox
                class="min-h-8 shrink-0 max-sm:min-h-11"
                :checked="!!item.appliesToAll"
                data-f="appliesToAll"
                @update:checked="onAll(item, $event)"
              >{{ tr('goodsAll') }}</ZCheckbox>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <ZSelect
                  mode="multiple"
                  :value="goodsIndexes(item)"
                  :options="goodsChoices(item)"
                  :disabled="!!item.appliesToAll"
                  :placeholder="tr('goodsPlaceholder')"
                  :class="boxCtl"
                  :aria-label="tr('goods')"
                  data-f="goodsItemIndexes"
                  @update:value="onGoods(item, $event)"
                />
                <span v-if="!item.appliesToAll && !goodsIndexes(item).length" class="text-xs leading-4 text-ink-3" data-doc44-goods-hint>{{ tr('goodsNoneHint') }}</span>
              </div>
            </div>

            <div
              v-if="hasMore && more.has(keyOf(item))"
              :id="domId(item, 'more')"
              class="grid grid-cols-1 gap-3 @2xl:grid-cols-3 @2xl:bg-canvas @2xl:px-3 @2xl:pt-2 @2xl:pb-3"
              data-doc44-extra
            >
              <template v-if="goodsOptions">
                <ZField :label="tr('docStartDate')">
                  <ZDate :value="item.docStartDate" allow-clear :class="ctl" data-f="docStartDate" @update:value="item.docStartDate = str($event)" />
                </ZField>
                <ZField :label="tr('docValidityDate')">
                  <ZDate :value="item.docValidityDate" allow-clear :class="ctl" data-f="docValidityDate" @update:value="item.docValidityDate = str($event)" />
                </ZField>
                <ZField :label="tr('issueCountryCode')">
                  <ZSelect
                    :value="item.issueCountryCode || null"
                    :options="countryOf(item)"
                    show-search
                    allow-clear
                    :filter-option="filterCountry"
                    :class="boxCtl"
                    placeholder="KZ"
                    data-f="issueCountryCode"
                    @update:value="item.issueCountryCode = str($event)"
                  />
                </ZField>
              </template>
              <template v-else>
                <ZField :label="tr('authorizedBody')">
                  <ZInput :value="item.authorizedBody" :maxlength="256" :class="ctl" data-f="authorizedBody" @update:value="setStr(item, 'authorizedBody', $event)" />
                </ZField>
                <ZField :label="tr('authorizedBodyId')">
                  <ZInput :value="item.authorizedBodyId" mono :maxlength="64" :class="ctl" data-f="authorizedBodyId" @update:value="setStr(item, 'authorizedBodyId', $event)" />
                </ZField>
                <ZField :label="tr('formBlankNumber')">
                  <ZInput :value="item.formBlankNumber" mono :maxlength="64" :class="ctl" data-f="formBlankNumber" @update:value="setStr(item, 'formBlankNumber', $event)" />
                </ZField>
              </template>
            </div>
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>
