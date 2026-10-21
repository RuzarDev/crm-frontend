// Таблица заголовков марки / товарного знака / модели — ТА ЖЕ, что MARK_COLUMN_TABLE в zircon-ai tests/test_generic.py
// (одно правило utils/markColumns.ts ↔ aqniet/marks.py, решение владельца 21.10.2026). Ключи — как в Zircon AI:
// brand — «Марка» ДТ, trademark — «Товарный знак», model — «Модель». Меняется правило — меняются обе таблицы.
import type { MarkField } from '@/utils/markColumns'

export type MarkKey = 'brand' | 'trademark' | 'model'
export const MARK_KEY_FIELD: Record<MarkKey, MarkField> = {
  brand: 'productMarkName', trademark: 'tradeMarkName', model: 'productModelName',
}

export const MARK_COLUMN_TABLE: [string, MarkKey][] = [
  // товарный знак
  ['Brand', 'trademark'], ['BRAND', 'trademark'], ['品牌', 'trademark'], ['Бренд', 'trademark'],
  ['Торговая марка', 'trademark'], ['ТОРГОВАЯ МАРКА ТОВАРА', 'trademark'], ['Товарный знак', 'trademark'],
  ['Торговый знак', 'trademark'], ['Trademark', 'trademark'], ['Trade mark', 'trademark'],
  ['Brand name', 'trademark'], ['Brand\n品牌', 'trademark'], ['品牌 Brand', 'trademark'], ['Бренд / 品牌', 'trademark'],
  ['商标', 'trademark'],
  // явный товарный знак рядом с «Марка» — товарный знак
  ['Товарный знак / Марка', 'trademark'], ['Марка / Trademark', 'trademark'], ['Trademark / Марка', 'trademark'],
  ['Торговая марка / Марка', 'trademark'], ['Марка / Brand name', 'trademark'], ['Brand name / Марка', 'trademark'],
  ['Марка / 商标', 'trademark'],
  // марка
  ['Марка', 'brand'], ['МАРКА', 'brand'], ['Марка товара', 'brand'], ['Марка / 品牌', 'brand'],
  ['Марка / Brand', 'brand'], ['Марка (бренд)', 'brand'], ['Марка\n品牌', 'brand'], ['Марка изделия', 'brand'],
  // двуязычная шапка в две строки (или в одну через пробел) — марка: русское слово — то, что имел в виду декларант
  // (ревью 22.10: Zircon AI получал заголовок с переводом строки, уже схлопнутым в пробел, — товарный знак)
  ['Марка\nBrand', 'brand'], ['Марка\r\nBrand', 'brand'], ['Brand\nМарка', 'brand'], ['Марка товара\nBrand', 'brand'],
  ['Марка Brand', 'brand'], ['Марка\nБренд', 'brand'],
  // бренд + модель — модель
  ['Brand/Model', 'model'], ['品牌型号', 'model'], ['品牌/型号', 'model'], ['Марка, модель', 'model'],
  ['Brand / Model No.', 'model'],
]
