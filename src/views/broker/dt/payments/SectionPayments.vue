<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalculator } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import { formatNumberIn } from '@/ui/number'
import type { Import40GoodsItemInput } from '@/types/api'
import type { DtFormState } from '../dtPayload'
import { formatItemNumbers } from '../goods/goodsList'
import type { DtGoodsModel } from '../goods/useDtGoods'
import type { DtPayments } from '../useDtPayments'
import FactPaymentsTable from './FactPaymentsTable.vue'
import PaymentsGoodsCard from './PaymentsGoodsCard.vue'
import PaymentsTotalsCard from './PaymentsTotalsCard.vue'
import { factVsGoodsDiff } from './paymentsModel'
import { MEDICAL_VAT, paymentsGoodsEntries, staleGoodsIndexes } from './paymentsView'

// Раздел «Платежи · гр. 47, В» (волна 6в, доска DtPayments). Одно действие «Рассчитать» (useDtPayments.calculate:
// гр. 45/46 → сохранить → расчёт по сохранённой ДТ → предпросмотр) и «Записать в гр. 47 и гр. В» в итогах.
// - Плашки: «Платежи устарели» (товары с «Пересчитать» или без гр. 47), «Данные изменились — рассчитайте заново»
//   (предпросмотр сброшен), расчёт готов (с товарами, которые он не пересчитал), почему расчёт остановился, сверка
//   гр. 47 ↔ гр. В (печать считает гр. В из гр. 47, XML — из фактических платежей).
// - Карточки товаров: с замечанием — всегда (ошибка/примечание расчёта; без предпросмотра — устаревшие платежи),
//   остальные свёрнуты «Ещё N … · показать все» (200 товаров открываются быстро); до 5 товаров видны все, с замечаниями —
//   не больше 5 карточек (до первого расчёта замечание у всех). «До подачи» раскрывает нужную
//   карточку событием payments-reveal на корне раздела (detail.index — позиция товара).
// - «Итого по видам» — здесь только на узких (totalsInline), на ≥ 1280 — правая колонка страницы.
// - Фактические платежи гр. В — таблица прямо по form.factPayments.
// Просмотр: без «Рассчитать», «Записать» и правок; суммы и таблица видны.
const props = defineProps<{
  form: DtFormState
  payments: DtPayments
  goods: DtGoodsModel
  readonly: boolean
  /** «Итого по видам» в разделе (уже 1280); иначе — в правой колонке страницы. */
  totalsInline: boolean
}>()
const emit = defineEmits<{ 'open-goods': [index: number] }>()
const { t, locale } = useI18n()
const tp = (key: string, p?: Record<string, unknown>) => t(`broker.dt.payments.${key}`, p ?? {})

const p = props.payments
const editable = computed(() => !props.readonly)
const state = computed(() => p.state.value)
/** Живой предпросмотр: позиции товаров — как при расчёте (в 'stale-preview' — уже нет). */
const live = computed(() => state.value === 'preview' || state.value === 'applying')

const entries = computed(() => paymentsGoodsEntries(props.form.goodsItems, live.value ? p.result.value : null))
const showAll = ref(false)
/** Карточки, раскрытые «До подачи», — по ключу товара (keyOf): удаление или перестановка товаров их не путает. */
const revealed = ref<ReadonlySet<number>>(new Set())
const keyAt = (index: number) => props.goods.keyOf(props.form.goodsItems[index])
// Немного товаров — видны все (сворачивать нечего). Дальше — только с замечаниями и не больше ISSUES_SHOWN карточек
// (до первого расчёта замечание у всех: 200 полных карточек по умолчанию не рисуем); остальное — «показать все».
const COLLAPSE_FROM = 6
const ISSUES_SHOWN = 5
const expanded = computed(() => showAll.value || entries.value.length < COLLAPSE_FROM)
const visible = computed(() => {
  if (expanded.value) return entries.value
  let issues = 0
  return entries.value.filter((e) => {
    if (revealed.value.size && revealed.value.has(keyAt(e.index))) return true
    if (!e.issue || issues >= ISSUES_SHOWN) return false
    issues += 1
    return true
  })
})
const hidden = computed(() => entries.value.length - visible.value.length)
/** Среди свёрнутых есть товары с замечаниями — подпись без «без замечаний». */
const hiddenIssues = computed(() => {
  const shown = new Set(visible.value.map((e) => e.index))
  return entries.value.some((e) => e.issue && !shown.has(e.index))
})

const staleList = computed(() => (p.result.value ? [] : staleGoodsIndexes(props.form.goodsItems)))
const notRecalculated = computed(() => (live.value ? p.notRecalculated.value : []))
/** Товары, у которых «Записать» уберёт строку сбора 1010 (не пересчитаны, сбор распределён между пересчитанными). */
const feeDropped = computed(() => entries.value.flatMap((e) => (e.feeDropped ? [e.index] : [])))
const diffs = computed(() => (p.result.value ? [] : factVsGoodsDiff(props.form)))
// Сверка — до копейки (расхождение в 0,30 ₸ без копеек выглядело бы как «1 000 ₸ и 1 000 ₸»).
const money2 = (n: number) => formatNumberIn(String(locale.value), n, 2, 2)

const problemText = computed(() => {
  switch (p.problem.value) {
    case 'noGoods': return tp('noGoods')
    case 'notSaved': return tp('notSaved')
    case 'customsFailed': return tp('problems.customsFailed')
    case 'calcFailed': return tp('problems.calcFailed')
    default: return ''
  }
})
const hint = computed(() => (state.value === 'calculating' && p.step.value ? tp(`steps.${p.step.value}`) : tp('hint')))

const calculate = () => { if (editable.value) void p.calculate() }
const onMedical = (item: Import40GoodsItemInput, checked: boolean) => {
  if (!editable.value) return
  // Правка пользователя: «Пересчитать» у товара, предпросмотр сбрасывается (версия правок формы).
  props.goods.setField(item, 'vatRatePreferential', checked ? MEDICAL_VAT : null)
}
const collapse = () => {
  showAll.value = false
  revealed.value = new Set()
}
// «До подачи» про гр. 47 товара: карточка свёрнута — раскрыть только её.
const onReveal = (e: Event) => {
  const index = (e as CustomEvent<{ index?: number }>).detail?.index
  if (typeof index !== 'number' || !props.form.goodsItems[index]) return
  const key = keyAt(index)
  if (!revealed.value.has(key)) revealed.value = new Set([...revealed.value, key])
}
</script>

<template>
  <section class="flex flex-col gap-4" data-dt-payments :data-state="state" @payments-reveal="onReveal">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 class="m-0 text-[15px] font-semibold text-ink">
        {{ t('broker.dt.sections.payments') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '47, В' }) }}</span>
      </h2>
      <p v-if="editable" class="m-0 min-w-0 flex-1 text-right text-[13px] text-muted max-sm:basis-full max-sm:text-left" aria-live="polite" data-payments-hint>{{ hint }}</p>
      <ZButton
        v-if="editable"
        class="max-sm:h-11 max-sm:w-full"
        :loading="p.loading.value"
        :disabled="p.applying.value"
        data-payments-calc
        @click="calculate"
      >
        <PhCalculator :size="16" aria-hidden="true" />{{ tp('calc') }}
      </ZButton>
    </div>

    <ZAlert v-if="problemText && state === 'idle'" type="error" :message="problemText" data-payments-problem />

    <ZAlert v-if="state === 'stale-preview'" type="warning" :message="tp('changed')" data-payments-changed>
      <template v-if="editable" #action>
        <ZButton variant="primary" size="sm" class="max-sm:h-11" data-payments-recalc @click="calculate">{{ tp('recalc') }}</ZButton>
      </template>
    </ZAlert>

    <ZAlert v-else-if="live" type="info" :message="tp('preview.title')" data-payments-preview>
      {{ tp('preview.text') }}
      <span v-if="notRecalculated.length" class="mt-1 block" data-payments-not-recalculated>
        {{ tp('preview.notRecalculated', { list: formatItemNumbers(notRecalculated) }) }}
      </span>
      <span v-if="feeDropped.length" class="mt-1 block" data-payments-fee-dropped-list>
        {{ tp('preview.feeDropped', { list: formatItemNumbers(feeDropped) }) }}
      </span>
    </ZAlert>

    <ZAlert v-else-if="staleList.length && state !== 'calculating'" type="warning" :message="tp('stale.title')" data-payments-stale>
      {{ tp('stale.text', { list: formatItemNumbers(staleList) }) }}
      <template v-if="editable" #action>
        <ZButton variant="primary" size="sm" class="max-sm:h-11" data-payments-recalc @click="calculate">{{ tp('recalc') }}</ZButton>
      </template>
    </ZAlert>

    <p v-if="!entries.length" class="m-0 text-[13px] text-muted" data-payments-no-goods>{{ tp('noGoodsInDt') }}</p>
    <div v-else class="flex flex-col gap-3" data-payments-goods-list>
      <PaymentsGoodsCard
        v-for="e in visible"
        :key="goods.keyOf(form.goodsItems[e.index])"
        :item="form.goodsItems[e.index]"
        :index="e.index"
        :calc="e.calc"
        :not-recalculated="e.notRecalculated"
        :fee-dropped="e.feeDropped"
        :readonly="readonly"
        @medical="onMedical(form.goodsItems[e.index], $event)"
        @open="emit('open-goods', e.index)"
      />
      <p v-if="hidden > 0 || (showAll && entries.length >= COLLAPSE_FROM)" class="m-0 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted" data-payments-more>
        <template v-if="hidden > 0">
          <span>{{ hiddenIssues ? tp('moreAny', { n: hidden }) : tp('more', { n: hidden }) }}</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            class="min-h-8 cursor-pointer rounded-field border-0 bg-transparent px-1 font-sans text-[13px] font-medium text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
            data-payments-show-all
            @click="showAll = true"
          >{{ tp('showAll') }}</button>
        </template>
        <button
          v-else
          type="button"
          class="min-h-8 cursor-pointer rounded-field border-0 bg-transparent px-1 font-sans text-[13px] font-medium text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
          data-payments-collapse
          @click="collapse"
        >{{ tp('collapse') }}</button>
      </p>
    </div>

    <PaymentsTotalsCard v-if="totalsInline" :form="form" :payments="payments" :editable="editable" />

    <ZAlert v-if="diffs.length" type="warning" :message="tp('diff.title')" data-payments-diff>
      <span v-for="d in diffs" :key="d.code" class="block" :data-payments-diff-code="d.code">
        {{ tp('diff.line', { code: d.code, goods: money2(d.goods), fact: money2(d.fact) }) }}
      </span>
    </ZAlert>

    <FactPaymentsTable :form="form" :readonly="readonly" />
  </section>
</template>
