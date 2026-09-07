// crm-frontend/src/composables/useDtTotals.ts
// Импорт 40 ДТ: автозаполнение агрегатов по товарам/расходам — Task 11
// (package 3, №15/№16). Мирроит дисциплину useTransitTotals.ts (package 1):
//
//   1) гр.22 (totalInvoiceValue) — Σ фактурной стоимости товаров
//      (Import40GoodsItemInput.customsValue — на бэке это InvoiceValue, см.
//      маппинг в Import40DtView.vue). Поле входит в Import40DeclarationUpsert
//      (реально сохраняется), поэтому пишем в форму, но только когда сумма
//      по товарам действительно изменилась — иначе правка любого другого поля
//      товара (deep watch) на каждый тик затирала бы ручную корректировку
//      гр.22 декларантом тем же значением снова и снова.
//   2) Лист/листы (sheetNumber/totalSheets) — тоже реальные поля Upsert.
//      sheetNumber по умолчанию 1, если ещё не задан. totalSheets — по
//      простому правилу бланка ДТ: один основной лист ТД1 покрывает первый
//      товар, каждый следующий товар — отдельный добавочный лист ТД2, т.е.
//      totalSheets = 1 + max(0, goodsCount - 1) (= goodsCount при goodsCount ≥ 1).
//      Поле остаётся редактируемым: пересчёт срабатывает только когда именно
//      это агрегированное значение меняется.
//   3) гр.5/гр.6 (число товаров/мест) и гр.12 (общая таможенная стоимость) —
//      НЕ входят в Import40DeclarationUpsert: сервер считает их на чтении
//      (Import40DeclarationDto.totalGoodsCount/totalPackagesCount/totalCustomsValue,
//      см. Import40Endpoints.cs — Count / Sum(CargoPlacesQuantity) / Sum(CustomsValueKzt)).
//      Поэтому это не «форма-поля», а чистые computed для мгновенного визуального
//      фидбека ДО сохранения — при сохранении их пересчитает и вернёт сервер
//      (Import40DtView.vue продолжает получать loadedDto с тем же ответом).
//      Здесь используется тот же источник для гр.6 (CargoPlacesQuantity), что
//      и на бэке, чтобы предпросмотр совпадал с серверным значением после save.
//      гр.12 на клиенте считается по упрощённой формуле: гр.22 * курс (гр.23) +
//      Σ расходов, переведённых в тенге по курсу их валюты (currencyRates —
//      тот же справочник НБ РК, что и в DtSectionFinance). Если валюта расхода
//      не найдена в справочнике, сумма расхода считается уже в тенге (rate=1) —
//      явное упрощение для случаев, когда справочник валют не загрузился.
//      Реальная серверная гр.12 (после «Рассчитать там. стоимость») — это
//      Σ customsValueKzt по товарам, которая учитывает распределение расходов
//      по весу/стоимости (см. ExpenseDistribution.Distribute на бэке) точнее,
//      чем эта клиентская оценка «в лоб».
import { computed, watch, type Ref } from 'vue'
import type { Import40GoodsItemInput, Import40DeclarationExpense } from '@/types/api'

export interface DtTotalsFormRef {
  totalInvoiceValue?: number | null
  sheetNumber?: number | null
  totalSheets?: number | null
  exchangeRate?: number | null
  expenses?: Import40DeclarationExpense[] | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

function sumInvoiceValue(goods: Import40GoodsItemInput[]): number {
  return round2(goods.reduce((acc, g) => acc + (typeof g.customsValue === 'number' ? g.customsValue : 0), 0))
}

export function useDtTotals(
  getGoods: () => Import40GoodsItemInput[],
  form: DtTotalsFormRef,
  currencyRates: Ref<Record<string, { rate: number; date: string }>>,
  // true во время массовой подстановки формы из decl (applyDeclaration) — на это
  // время авто-запись в форму приостанавливается, чтобы не затереть только что
  // загруженные с сервера значения пересчитанной с нуля суммой по товарам
  // (те же соображения, что у guard applyingDeclaration/goodsOriginKey рядом).
  suspended: Ref<boolean>,
) {
  // --- computed-предпросмотр гр.5/гр.6/гр.12 (не пишутся в форму, см. шапку файла) ---
  const goodsCount = computed(() => getGoods().length)
  const packagesCount = computed(() =>
    getGoods().reduce((acc, g) => acc + (typeof g.cargoPlacesQuantity === 'number' ? g.cargoPlacesQuantity : 0), 0),
  )
  const expensesKzt = computed(() =>
    (form.expenses ?? []).reduce((acc, e) => {
      if (typeof e.amount !== 'number') return acc
      const code = e.currencyCode ?? ''
      const rate = code === 'KZT' ? 1 : currencyRates.value[code]?.rate
      return acc + e.amount * (rate ?? 1)
    }, 0),
  )
  const customsValueKzt = computed(() => {
    const rate = form.exchangeRate ?? 1
    return round2((form.totalInvoiceValue ?? 0) * rate + expensesKzt.value)
  })

  // --- авто-запись в реальные поля формы (гр.22, лист/листы) ---
  let lastInvoiceValue: number | null = null
  let lastTotalSheets: number | null = null

  watch(
    getGoods,
    (list) => {
      const invoiceValue = sumInvoiceValue(list)
      const totalSheets = list.length ? 1 + Math.max(0, list.length - 1) : null

      const invoiceChanged = invoiceValue !== lastInvoiceValue
      const sheetsChanged = totalSheets !== null && totalSheets !== lastTotalSheets
      // Трекеры обновляем всегда (и во время suspended), чтобы после загрузки
      // декларации следующий реальный watch-тик сравнивался с актуальной суммой,
      // а не со значением по умолчанию (null/0) и не перезаписывал форму сразу
      // после load на ровном месте.
      lastInvoiceValue = invoiceValue
      if (totalSheets !== null) lastTotalSheets = totalSheets

      if (suspended.value) return
      if (invoiceChanged) form.totalInvoiceValue = invoiceValue
      if (form.sheetNumber == null && list.length) form.sheetNumber = 1
      if (sheetsChanged) form.totalSheets = totalSheets
    },
    { deep: true, immediate: true },
  )

  return { goodsCount, packagesCount, customsValueKzt }
}
