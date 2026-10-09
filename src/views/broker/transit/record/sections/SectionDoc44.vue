<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRaw, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ReestrDoc44ItemInput } from '@/types/api'
import { formatDateText } from '@/ui/date'
import type { ZOption } from '@/ui/options'
import type { RecordDraft } from '../recordModel'
import RecordSection from './RecordSection.vue'
import { useRecordRefs } from './refs'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, str } from './ui'

// Раздел «Документы гр. 44» (доска TransitRecord, разбор §2.5): таблица с правкой на месте — код (классификатор
// 2009, выбор подставляет вид), вид, номер, дата; под строкой «Ещё» — уполномоченный орган, ИД органа, номер
// бланка (сервер их хранит). «Действует с / по» и «Страна выдачи» сервер не хранит — не показываются (B.6).
// В узком разделе строки — карточки с подписями полей. Порог — по ширине раздела (@container, как у GoodsCard),
// не окна: в половине редактора партии (~540px) — карточки, на странице записи 4б (~830px) — таблица.
// extended=false — без «Ещё» (гр.44 партии пакета: у неё таких полей нет), новая строка — только код, вид, номер, дата.
const props = withDefaults(defineProps<{ draft: RecordDraft; readonly: boolean; extended?: boolean }>(), { extended: true })
const { t } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.transitRecord.doc44.${key}`, p ?? {})

const refs = useRecordRefs()
void refs.ensureClassifiers(['2009'])
const classifiers = useClassifiersStore()
// В поле — только код (колонка узкая, вид документа стоит рядом), в списке — «04021 — Инвойс…»; поиск — по обоим.
const docTypeOptions = computed<ZOption[]>(() => refs.classifierOptions('2009').map((o) => ({ value: o.value, label: String(o.value), full: o.label })))
const fullLabel = (o: ZOption) => String(o.full ?? o.label)
const filterDocType = (input: string, o: ZOption) => fullLabel(o).toLocaleLowerCase('ru').includes(input.toLocaleLowerCase('ru'))

const uid = useId()
const ids = new WeakMap<object, number>()
let nextId = 0
const keyOf = (item: ReestrDoc44ItemInput): number => {
  const raw = toRaw(item)
  let id = ids.get(raw)
  if (id === undefined) {
    id = ++nextId
    ids.set(raw, id)
  }
  return id
}
const domId = (item: ReestrDoc44ItemInput, field: string) => `doc44-${uid}-${keyOf(item)}-${field}`

const more = reactive(new Set<number>())
const toggleMore = (item: ReestrDoc44ItemInput) => {
  const k = keyOf(item)
  if (more.has(k)) more.delete(k)
  else more.add(k)
}

/** Новая строка — только поля, которые хранит сервер (прежняя форма слала и поля Импорта 40). */
const newDoc = (): ReestrDoc44ItemInput => (props.extended
  ? { docTypeCode: null, docTypeName: null, docNumber: null, docDate: null, authorizedBody: null, authorizedBodyId: null, formBlankNumber: null }
  : { docTypeCode: null, docTypeName: null, docNumber: null, docDate: null })

const listEl = ref<HTMLElement | null>(null)
const add = async () => {
  if (props.readonly) return
  props.draft.doc44.push(newDoc())
  await nextTick()
  const rowsEls = listEl.value?.querySelectorAll<HTMLElement>('[data-doc44-row]')
  rowsEls?.[rowsEls.length - 1]?.querySelector<HTMLElement>('[data-f="docTypeCode"]')?.focus()
}
const remove = (item: ReestrDoc44ItemInput) => {
  if (props.readonly) return
  const at = props.draft.doc44.indexOf(item)
  if (at >= 0) props.draft.doc44.splice(at, 1)
  more.delete(keyOf(item))
}

type StrKey = Exclude<keyof ReestrDoc44ItemInput, 'docDate'>
const setStr = (item: ReestrDoc44ItemInput, key: StrKey, v: unknown) => { item[key] = str(v) }
const onCode = (item: ReestrDoc44ItemInput, v: unknown) => {
  const code = str(v)
  item.docTypeCode = code
  const found = classifiers.cache['2009']?.find((c) => c.code === code)
  if (found) item.docTypeName = found.nameRu
}

/** Сколько полей под «Ещё» заполнено — метка на кнопке, чтобы данные не прятались в свёрнутой строке. */
const extrasCount = (item: ReestrDoc44ItemInput) => [item.authorizedBody, item.authorizedBodyId, item.formBlankNumber].filter((v) => v).length
const moreAria = (item: ReestrDoc44ItemInput, n: number) => {
  const c = extrasCount(item)
  return c ? `${tr('moreLabel', { n })}, ${tr('moreFilled', { count: c })}` : tr('moreLabel', { n })
}

const extras = (item: ReestrDoc44ItemInput) => (!props.extended ? '' : ([
  ['authorizedBody', item.authorizedBody],
  ['authorizedBodyId', item.authorizedBodyId],
  ['formBlankNumber', item.formBlankNumber],
] as const).filter(([, v]) => v).map(([k, v]) => `${tr(k)}: ${v}`).join(' · '))

const cols = '@2xl:grid-cols-[10rem_minmax(0,1.5fr)_minmax(0,1fr)_9.5rem_auto]'
const cellLabel = 'text-xs leading-4 text-ink-3 @2xl:sr-only'
const cell = 'flex min-w-0 flex-col gap-1'
const iconBtn = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
</script>

<template>
  <RecordSection id="doc44" :title="t('broker.transitRecord.sections.doc44')" :count="draft.doc44.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="tr('add')" @click="add" />
    </template>

    <p v-if="!draft.doc44.length" class="m-0 text-sm text-ink-3" data-doc44-empty>{{ tr('empty') }}</p>
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
            v-for="(item, index) in draft.doc44"
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
                    v-if="extended"
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
              <div
                v-if="extended && more.has(keyOf(item))"
                :id="domId(item, 'more')"
                class="grid grid-cols-1 gap-3 @2xl:grid-cols-3 @2xl:bg-canvas @2xl:px-3 @2xl:pt-2 @2xl:pb-3"
                data-doc44-extra
              >
                <ZField :label="tr('authorizedBody')">
                  <ZInput :value="item.authorizedBody" :maxlength="256" :class="ctl" data-f="authorizedBody" @update:value="setStr(item, 'authorizedBody', $event)" />
                </ZField>
                <ZField :label="tr('authorizedBodyId')">
                  <ZInput :value="item.authorizedBodyId" mono :maxlength="64" :class="ctl" data-f="authorizedBodyId" @update:value="setStr(item, 'authorizedBodyId', $event)" />
                </ZField>
                <ZField :label="tr('formBlankNumber')">
                  <ZInput :value="item.formBlankNumber" mono :maxlength="64" :class="ctl" data-f="formBlankNumber" @update:value="setStr(item, 'formBlankNumber', $event)" />
                </ZField>
              </div>
            </template>
          </li>
        </ul>
      </div>
    </div>
  </RecordSection>
</template>
