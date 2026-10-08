<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhUploadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import type { ReestrGoodsItemInput } from '@/types/api'
import { goodsTotals, type RecordDraft } from '../recordModel'
import GoodsCard from './GoodsCard.vue'
import { formatKg, formatQty, formatValue, goodsHasData, newGoodsItem, provideTnvedCheck } from './goods'
import { GOODS_EXCEL_ACCEPT, GOODS_EXCEL_MESSAGES, isExcelFileName, readGoodsExcel } from '@/utils/goodsExcel'
import RecordSection from './RecordSection.vue'
import SectionAddButton from './SectionAddButton.vue'

// Раздел «Товары» (доска TransitRecord, разбор §2.4): карточки товаров, «Из Excel», строка итогов.
// Товары пишутся прямо в draft.goods. Итоги записи («Основное») пишет useTransitRecord — здесь только показ.
// Развёрнутость — по стабильному ключу товара (WeakMap по объекту), не по индексу: при открытии записи
// развёрнута первая карточка, добавленная кнопкой — тоже; строки из Excel приходят свёрнутыми.
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t, locale } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.transitRecord.goods.${key}`, p ?? {})
const { confirm } = useConfirm()

const check = provideTnvedCheck()

const ids = new WeakMap<object, number>()
let nextId = 0
const keyOf = (item: ReestrGoodsItemInput): number => {
  const raw = toRaw(item)
  let id = ids.get(raw)
  if (id === undefined) {
    id = ++nextId
    ids.set(raw, id)
  }
  return id
}
const expanded = reactive(new Set<number>())
// При открытии записи (массив товаров новый) развёрнута первая карточка, остальные свёрнуты. Сохранение,
// перечитывание и «Отменить» кладут значения в те же массив и объекты (useTransitRecord) — развёрнутость остаётся;
// push/splice массив тоже не подменяют.
watch(() => props.draft.goods, (goods) => {
  expanded.clear()
  if (goods.length) expanded.add(keyOf(goods[0]))
}, { immediate: true })
const toggle = (item: ReestrGoodsItemInput) => {
  const k = keyOf(item)
  if (expanded.has(k)) expanded.delete(k)
  else expanded.add(k)
}

const cardRefs = new Map<number, { focusCode: () => void }>()
const setCardRef = (item: ReestrGoodsItemInput, el: unknown) => {
  if (el) cardRefs.set(keyOf(item), el as { focusCode: () => void })
  else cardRefs.delete(keyOf(item))
}

const add = async () => {
  if (props.readonly) return
  props.draft.goods.push(newGoodsItem())
  const item = props.draft.goods[props.draft.goods.length - 1]
  expanded.add(keyOf(item))
  await nextTick()
  cardRefs.get(keyOf(item))?.focusCode()
}

const remove = async (item: ReestrGoodsItemInput) => {
  if (props.readonly) return
  const n = props.draft.goods.indexOf(item) + 1
  if (goodsHasData(item)) {
    const ok = await confirm({ title: tr('deleteTitle', { n }), content: tr('deleteText'), okText: t('common.delete'), danger: true })
    if (!ok) return
  }
  // За время вопроса список мог поменяться — ищем товар заново.
  const at = props.draft.goods.indexOf(item)
  if (at >= 0) props.draft.goods.splice(at, 1)
  expanded.delete(keyOf(item))
}

// ── «Из Excel»: прежние правила разбора и тексты dt.*; строки — в конец ─────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const excelBusy = ref(false)
const onFile = async (e: Event) => {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  if (!isExcelFileName(file.name)) {
    message.error(t('dt.dopustimTolkoExcel'))
    return
  }
  excelBusy.value = true
  try {
    const result = await readGoodsExcel(file)
    if ('problem' in result) {
      message.warning(t(GOODS_EXCEL_MESSAGES[result.problem]))
      return
    }
    props.draft.goods.push(...result.goods)
    message.success(t('dt.zagruzhenoTovarov', { n: result.goods.length }))
  } catch (err) {
    console.error('Failed to import goods from Excel', err)
    message.error(t('dt.neUdalosProchitatFayl'))
  } finally {
    excelBusy.value = false
  }
}

// Коды сохранённых товаров проверяем при открытии: ошибочный код (из КП, импорта) виден сразу.
onMounted(async () => {
  if (props.readonly) return
  for (const g of [...props.draft.goods]) await check.validate(g.tnvedCode)
})

const totals = computed(() => goodsTotals(props.draft.goods))
const totalCells = computed(() => {
  const s = totals.value
  const dash = '—'
  return [
    { key: 'items', label: tr('totalItems'), value: formatQty(s.items, locale.value) },
    { key: 'places', label: tr('totalPlaces'), value: s.places == null ? dash : formatQty(s.places, locale.value) },
    { key: 'gross', label: tr('totalGross'), value: s.gross == null ? dash : formatKg(s.gross, locale.value) },
    { key: 'value', label: tr('totalValue'), value: s.value == null ? dash : `${formatValue(s.value, locale.value)} ${s.currency ?? ''}`.trim() },
  ]
})
</script>

<template>
  <RecordSection id="goods" :title="t('broker.transitRecord.sections.goods')" :count="draft.goods.length">
    <template v-if="!readonly" #actions>
      <input ref="fileInput" type="file" class="hidden" tabindex="-1" aria-hidden="true" :accept="GOODS_EXCEL_ACCEPT" data-goods-excel-input @change="onFile">
      <ZButton variant="ghost" :loading="excelBusy" class="max-sm:h-11" data-goods-excel @click="fileInput?.click()">
        <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
        {{ tr('fromExcel') }}
      </ZButton>
      <SectionAddButton :label="tr('add')" @click="add" />
    </template>

    <p v-if="!draft.goods.length" class="m-0 text-sm text-ink-3" data-goods-empty>{{ tr('empty') }}</p>
    <template v-else>
      <ul role="list" class="m-0 flex list-none flex-col gap-2.5 p-0">
        <li v-for="(item, index) in draft.goods" :key="keyOf(item)">
          <GoodsCard
            :ref="(el) => setCardRef(item, el)"
            :item="item"
            :index="index"
            :readonly="readonly"
            :expanded="expanded.has(keyOf(item))"
            @toggle="toggle(item)"
            @remove="remove(item)"
          />
        </li>
      </ul>

      <div class="flex flex-col gap-2">
        <dl class="m-0 grid grid-cols-2 overflow-hidden rounded-row border border-line bg-canvas sm:grid-cols-4" data-goods-totals>
          <div
            v-for="(cell, i) in totalCells"
            :key="cell.key"
            class="flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5"
            :class="[i > 0 && 'sm:border-l sm:border-line', i % 2 === 1 && 'max-sm:border-l max-sm:border-line', i > 1 && 'max-sm:border-t max-sm:border-line']"
            :data-total="cell.key"
          >
            <dt class="text-xs leading-4 text-ink-3">{{ cell.label }}</dt>
            <dd class="m-0 text-sm font-semibold text-ink tabular-nums">{{ cell.value }}</dd>
          </div>
        </dl>
        <p class="m-0 text-[12.5px] leading-5 text-muted">{{ tr('totalsHint') }}</p>
      </div>
    </template>
  </RecordSection>
</template>
