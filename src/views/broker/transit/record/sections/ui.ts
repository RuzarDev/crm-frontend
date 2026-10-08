// Общие классы раскладки разделов вкладки «Данные» и мелкие помощники значений.

/** Сетка полей: на телефоне одна колонка. */
export const grid = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
// Телефон: поля ≥ 44px. У ZInput/ZNumber/ZDate класс идёт на саму рамку, у ZSelect/ZCombobox — на корень, рамка внутри.
export const ctl = 'max-sm:h-11'
export const boxCtl = 'max-sm:*:h-11'

/** Пустое значение поля — null (на сервер не уходят пустые строки). */
export const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
