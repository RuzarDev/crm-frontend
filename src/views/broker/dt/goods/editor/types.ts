// Контракт редактора товара ДТ (волна 6б): что получают секции и как их добавить.
//
// Секция — компонент с пропсами GoodsSectionProps: правит item на месте; правка пользователя в поле, влияющем на платежи,
// идёт через model.setField (или присваивание + model.markStale) — товар получает «Пересчитать»; производные присваивания
// (ДЕИ по коду, гр. 46 по гр. 45, места КЕДЕН = места) — напрямую, без пометки. Каждое поле — в ZField с data-graph
// (переход «к недостающему» из «До подачи»); readonly — всё только для чтения.
// Новая секция (Tasks 4–6) = компонент + строка в GOODS_EDITOR_SECTIONS (sections.ts) + подпись
// broker.dt.goods.editor.sections.<key> (ru/kk/en): вкладка-якорь появляется сама.
import type { Component } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import type { ZOption } from '@/ui/options'
import type { DtGoodsModel } from '../useDtGoods'

export interface GoodsCountryOption {
  value: string
  label: string
  alpha2?: string | null
}

/** Данные страницы ДТ, которые нужны секциям товара (DtPage → SectionGoods → GoodsEditor). */
export interface GoodsPageContext {
  /** Курс USD на дату гр. А (₸ за 1 USD) — гр. 46 = гр. 45 / курс. */
  usdRate: number | null
  /** Дата гр. А, 'YYYY-MM-DD' — ставки КЕДЕН на эту дату. */
  onDate: string | null
  /** Валюты (выбор валюты товара, когда гр. 22 не задана). */
  currencyOptions: ZOption[]
  /** Гр. 1: направление (ИМ/ЭК) и процедура ДТ — списки КЕДЕН гр. 36/37 (Task 4). */
  direction: string | null
  declProcedure: string | null
  /** Гр. 19: контейнерная перевозка — поле «Номер контейнера» гр. 31.3 (Task 4). */
  containerIndicator: boolean
}

export interface GoodsEditorContext extends GoodsPageContext {
  /** Гр. 22 — валюта сделки; задана — валюта товара заблокирована и равна ей. */
  currency: string | null
  countryOptions: GoodsCountryOption[]
}

/** Состояние сохранения ДТ — подвал редактора. */
export interface GoodsSaveState {
  saving: boolean
  dirty: boolean
  failed: boolean
  savedAt: Date | null
}

export interface GoodsSectionProps {
  item: Import40GoodsItemInput
  /** Позиция товара (с 0). */
  index: number
  model: DtGoodsModel
  readonly: boolean
  ctx: GoodsEditorContext
}

export interface GoodsEditorSection {
  /** Ключ вкладки и подписи broker.dt.goods.editor.sections.<key>. */
  key: string
  component: Component
}

export const emptyGoodsPageContext = (): GoodsPageContext => ({
  usdRate: null,
  onDate: null,
  currencyOptions: [],
  direction: null,
  declProcedure: null,
  containerIndicator: false,
})
