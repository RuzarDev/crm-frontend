<script setup lang="ts">
import { computed, nextTick, ref, toRaw, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import ZDate from '@/components/z/ZDate.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { vUppercase } from '@/directives/uppercase'
import type { Import40PrevDocItem } from '@/api/import40'
import { useClassifiersStore } from '@/stores/classifiers'
import { formatDateText } from '@/ui/date'
import type { ZOption } from '@/ui/options'
import { dedupeOptions, withCurrent } from '../dtOptions'

// Предшествующие документы (гр. 40): строки «вид (классификатор) · номер · дата · товар». Строки правятся прямо в массиве
// формы; sortOrder всегда равен месту в списке. Товар — выбор из товаров ДТ; хранится, как раньше, номером товара
// строкой («1», «2», 1-based: сервер читает его как порядковый номер позиции в XML). Старое нечисловое значение остаётся
// отдельным пунктом списка, пока его не заменят.
// Таблица или карточки — по ширине раздела (@container), как у списка гр. 44.
const props = defineProps<{
  items: Import40PrevDocItem[]
  readonly: boolean
  /** Товары ДТ: value — индекс с 0, подпись «Товар N · код». */
  goodsOptions: ZOption[]
}>()
const { t } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.dt.docs.prev.${key}`, p ?? {})
const classifiers = useClassifiersStore()

const typeOptions = computed(() => dedupeOptions(classifiers.options('prev-doc-types')))
const typeFor = (code: string | null) => withCurrent(typeOptions.value, code).options
const goodsFor = (value: string | null): ZOption[] => {
  const list = props.goodsOptions.map((o) => ({ value: String(Number(o.value) + 1), label: o.label }))
  return withCurrent(list, value).options
}
const goodsText = (value: string | null) => goodsFor(value).find((o) => o.value === (value ?? '').trim())?.label ?? (value ?? '')

const uid = useId()
const ids = new WeakMap<object, number>()
let nextId = 0
const keyOf = (item: Import40PrevDocItem): number => {
  const raw = toRaw(item)
  let id = ids.get(raw)
  if (id === undefined) { id = ++nextId; ids.set(raw, id) }
  return id
}
const domId = (item: Import40PrevDocItem, field: string) => `prev-${uid}-${keyOf(item)}-${field}`

const renumber = () => props.items.forEach((x, i) => { x.sortOrder = i })
const listEl = ref<HTMLElement | null>(null)
const add = async () => {
  if (props.readonly) return
  props.items.push({ docTypeCode: null, docNumber: null, docDate: null, goodsNumber: null, goodsItemIndex: null, sortOrder: props.items.length })
  await nextTick()
  const rows = listEl.value?.querySelectorAll<HTMLElement>('[data-prev-row]')
  rows?.[rows.length - 1]?.querySelector<HTMLElement>('[data-f="docTypeCode"]')?.focus()
}
defineExpose({ add })
const remove = (item: Import40PrevDocItem) => {
  const at = props.items.indexOf(item)
  if (at >= 0) props.items.splice(at, 1)
  renumber()
}
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

const cols = '@2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9.5rem_minmax(0,1.2fr)_auto]'
const cellLabel = 'text-xs leading-4 text-ink-3 @2xl:sr-only'
const cell = 'flex min-w-0 flex-col gap-1'
const ctl = 'max-sm:h-11'
const boxCtl = 'max-sm:*:h-11'
const iconBtn = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
</script>

<template>
  <p v-if="!items.length" class="m-0 text-sm text-ink-3" data-prev-empty>{{ readonly ? tr('emptyReadonly') : tr('empty') }}</p>
  <div v-else class="@container min-w-0">
    <div ref="listEl" class="min-w-0 @2xl:overflow-hidden @2xl:rounded-row @2xl:border @2xl:border-line" data-prev-list>
      <div
        aria-hidden="true"
        :class="['hidden gap-2 border-b border-line bg-canvas px-3 py-2 text-xs leading-4 font-medium text-ink-3 @2xl:grid', cols]"
        data-prev-head
      >
        <span>{{ tr('type') }}</span><span>{{ tr('number') }}</span><span>{{ tr('date') }}</span><span>{{ tr('goods') }}</span><span />
      </div>
      <ul role="list" class="m-0 flex list-none flex-col p-0 @max-2xl:gap-2.5">
        <li
          v-for="(item, index) in items"
          :key="keyOf(item)"
          class="flex min-w-0 flex-col @max-2xl:rounded-row @max-2xl:border @max-2xl:border-line @max-2xl:bg-surface @max-2xl:p-3 @2xl:border-t @2xl:border-line @2xl:first:border-t-0"
          data-prev-row
        >
          <div v-if="readonly" :class="['grid grid-cols-1 gap-3 @2xl:items-center @2xl:gap-2 @2xl:px-3 @2xl:py-3', cols]">
            <div :class="cell"><span :class="cellLabel">{{ tr('type') }}</span><span class="text-sm break-words text-ink">{{ typeFor(item.docTypeCode).find((o) => o.value === item.docTypeCode)?.label ?? (item.docTypeCode || '—') }}</span></div>
            <div :class="cell"><span :class="cellLabel">{{ tr('number') }}</span><span class="font-mono text-sm break-words text-ink">{{ item.docNumber || '—' }}</span></div>
            <div :class="cell"><span :class="cellLabel">{{ tr('date') }}</span><span class="text-sm text-ink tabular-nums">{{ formatDateText(item.docDate) || '—' }}</span></div>
            <div :class="cell"><span :class="cellLabel">{{ tr('goods') }}</span><span class="text-sm break-words text-ink">{{ item.goodsNumber ? goodsText(item.goodsNumber) : '—' }}</span></div>
            <span />
          </div>
          <div v-else :class="['grid grid-cols-1 gap-3 @2xl:items-center @2xl:gap-2 @2xl:px-3 @2xl:py-2', cols]">
            <div :class="cell">
              <label :for="domId(item, 'type')" :class="cellLabel">{{ tr('type') }}</label>
              <ZSelect
                :id="domId(item, 'type')"
                :value="item.docTypeCode"
                :options="typeFor(item.docTypeCode)"
                show-search
                allow-clear
                :placeholder="tr('typePlaceholder')"
                :popup-width="460"
                :class="boxCtl"
                data-f="docTypeCode"
                @update:value="item.docTypeCode = str($event)"
              />
            </div>
            <div :class="cell">
              <label :for="domId(item, 'number')" :class="cellLabel">{{ tr('number') }}</label>
              <ZInput v-uppercase :id="domId(item, 'number')" :value="item.docNumber" mono :maxlength="256" :class="ctl" data-f="docNumber" @update:value="item.docNumber = str($event)" />
            </div>
            <div :class="cell">
              <label :for="domId(item, 'date')" :class="cellLabel">{{ tr('date') }}</label>
              <ZDate :id="domId(item, 'date')" :value="item.docDate" allow-clear :class="ctl" data-f="docDate" @update:value="item.docDate = str($event)" />
            </div>
            <div :class="cell">
              <label :for="domId(item, 'goods')" :class="cellLabel">{{ tr('goods') }}</label>
              <ZSelect
                :id="domId(item, 'goods')"
                :value="item.goodsNumber"
                :options="goodsFor(item.goodsNumber)"
                allow-clear
                :placeholder="tr('goodsPlaceholder')"
                :popup-width="320"
                :class="boxCtl"
                data-f="goodsNumber"
                @update:value="item.goodsNumber = str($event)"
              />
            </div>
            <div class="flex items-center justify-end">
              <button type="button" :class="iconBtn" :aria-label="tr('deleteLabel', { n: index + 1 })" data-prev-delete @click="remove(item)"><PhX :size="16" aria-hidden="true" /></button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
