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
//      sheetNumber по умолчанию 1, если ещё не задан. totalSheets — как в печати
//      (DtBlankPdf.cs): основной лист ТД1 — первый товар, добавочные ТД2 — по 3
//      товара на лист: totalSheets = 1 + ceil((n − 1) / 3) (баг B5, 09.10: раньше
//      считалось «лист на товар», и поле расходилось с бланком). Значение
//      производное, поэтому приводится к правилу и при загрузке ДТ (suspended):
//      иначе у старых ДТ оставалось бы прежнее число.
//   3) гр.5/гр.6 (число товаров/мест) и гр.12 (общая таможенная стоимость) —
//      НЕ входят в Import40DeclarationUpsert: сервер считает их на чтении
//      (Import40DeclarationDto.totalGoodsCount/totalPackagesCount/totalCustomsValue,
//      см. Import40Endpoints.cs — Count / Sum(CargoPlacesQuantity) / Sum(CustomsValueKzt)).
//      Поэтому это не «форма-поля», а чистые computed для мгновенного визуального
//      фидбека ДО сохранения — при сохранении их пересчитает и вернёт сервер
//      (Import40DtView.vue продолжает получать loadedDto с тем же ответом).
//      Здесь используется тот же источник мест, что и на бэке (Import40Places.Of:
//      CargoPlacesQuantity, затем PackagesCount — см. utils/goodsPlaces),
//      чтобы предпросмотр совпадал с серверным значением после save.
//      гр.12 на клиенте (предпросмотр) считается по упрощённой формуле: гр.22 * курс (гр.23) +
//      Σ расходов − Σ вычетов (RefExpenseType.IsDeduction, опция isDeduction), переведённых в тенге
//      по курсу их валюты (currencyRates — тот же справочник НБ РК, что и в DtSectionFinance).
//      Если валюта расхода не найдена в справочнике, сумма расхода считается уже в тенге (rate=1) —
//      явное упрощение для случаев, когда справочник валют не загрузился.
//      Реальная серверная гр.12 — Σ customsValueKzt по товарам (её печатает бланк и выгружает XML),
//      она учитывает распределение расходов (ExpenseDistribution.Distribute на бэке). Баг B6 (09.10):
//      пока нет несохранённых правок (опция dirty), показываем серверное значение (serverCustomsValue,
//      последний ответ GET/PUT), а предпросмотр — только пока правки не сохранены.
import { computed, watch, type Ref } from 'vue'
import type { Import40GoodsItemInput, Import40DeclarationExpense } from '@/types/api'
import { placesOfGoods } from '@/utils/goodsPlaces'

export interface DtTotalsOptions {
  /** Статья расхода — вычет (гр.21–23 ДТС, RefExpenseType.IsDeduction): в гр.12 вычитается. */
  isDeduction?: (expenseTypeCode: string | null | undefined) => boolean
  /** Серверная гр.12 последнего ответа (Import40DeclarationDto.totalCustomsValue). */
  serverCustomsValue?: () => number | null | undefined
  /** Есть несохранённые правки: пока true, гр.12 — предпросмотр, иначе — серверное значение. */
  dirty?: () => boolean
}

/** Всего листов ДТ как в печати (DtBlankPdf.cs): ТД1 — первый товар, ТД2 — по 3 товара. Нет товаров — null. */
export const totalSheetsFor = (goodsCount: number): number | null =>
  goodsCount > 0 ? 1 + Math.ceil((goodsCount - 1) / 3) : null

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
  opts: DtTotalsOptions = {},
) {
  // --- computed-предпросмотр гр.5/гр.6/гр.12 (не пишутся в форму, см. шапку файла) ---
  const goodsCount = computed(() => getGoods().length)
  const packagesCount = computed(() =>
    getGoods().reduce((acc, g) => acc + (placesOfGoods(g) ?? 0), 0),
  )
  const expensesKzt = computed(() =>
    (form.expenses ?? []).reduce((acc, e) => {
      if (typeof e.amount !== 'number') return acc
      const code = e.currencyCode ?? ''
      const rate = code === 'KZT' ? 1 : currencyRates.value[code]?.rate
      const sign = opts.isDeduction?.(e.expenseTypeCode) ? -1 : 1
      return acc + sign * e.amount * (rate ?? 1)
    }, 0),
  )
  const customsValuePreview = computed(() => {
    const rate = form.exchangeRate ?? 1
    return round2((form.totalInvoiceValue ?? 0) * rate + expensesKzt.value)
  })
  const customsValueFromServer = computed(() => {
    const server = opts.serverCustomsValue?.()
    return typeof server === 'number' && !(opts.dirty?.() ?? true)
  })
  const customsValueKzt = computed(() =>
    customsValueFromServer.value ? (opts.serverCustomsValue?.() as number) : customsValuePreview.value,
  )

  // --- авто-запись в реальные поля формы (гр.22, лист/листы) ---
  let lastInvoiceValue: number | null = null
  let lastTotalSheets: number | null = null

  watch(
    getGoods,
    (list) => {
      const invoiceValue = sumInvoiceValue(list)
      const totalSheets = totalSheetsFor(list.length)

      const invoiceChanged = invoiceValue !== lastInvoiceValue
      const sheetsChanged = totalSheets !== null && totalSheets !== lastTotalSheets
      // Трекеры обновляем всегда (и во время suspended), чтобы после загрузки
      // декларации следующий реальный watch-тик сравнивался с актуальной суммой,
      // а не со значением по умолчанию (null/0) и не перезаписывал форму сразу
      // после load на ровном месте.
      lastInvoiceValue = invoiceValue
      if (totalSheets !== null) lastTotalSheets = totalSheets

      if (suspended.value) {
        // Листы — производное «как в печати»: при загрузке приводим устаревшее значение (B5).
        if (totalSheets !== null && form.totalSheets !== totalSheets) form.totalSheets = totalSheets
        return
      }
      if (invoiceChanged) form.totalInvoiceValue = invoiceValue
      if (form.sheetNumber == null && list.length) form.sheetNumber = 1
      if (sheetsChanged) form.totalSheets = totalSheets
    },
    { deep: true, immediate: true },
  )

  return { goodsCount, packagesCount, customsValueKzt, customsValuePreview, customsValueFromServer }
}
