// Секции редактора товара — по порядку вкладок-якорей (доска DtGoodsEditor): «Код и описание · Количество и стоимость ·
// Упаковка · Льготы и процедура · Гр. 33 · Маркировка · Доп. сведения · Платежи». Здесь — только существующие секции:
// вкладка показывается для каждой строки списка. Добавить секцию — см. types.ts.
import GoodsCodeSection from './GoodsCodeSection.vue'
import GoodsQtyValueSection from './GoodsQtyValueSection.vue'
import GoodsPackagingSection from './GoodsPackagingSection.vue'
import GoodsPreferencesSection from './GoodsPreferencesSection.vue'
import type { GoodsEditorSection } from './types'

export const GOODS_EDITOR_SECTIONS: readonly GoodsEditorSection[] = [
  { key: 'code', component: GoodsCodeSection },
  { key: 'qty', component: GoodsQtyValueSection },
  { key: 'packaging', component: GoodsPackagingSection },
  { key: 'prefs', component: GoodsPreferencesSection },
]
