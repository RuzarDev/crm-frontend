// Пункт готовности ДТС (Graph «ДТС», без товара) → поле раздела «ДТС» (data-goods-field): переход из «До подачи»
// к самому полю, а не к плашке. Тексты — DtsXmlReadiness (сервер). Прочие пункты ДТС — к плашке раздела.
export type DtsFieldKey = 'dtsPlace' | 'dtsReason'

export function dtsFieldFromReadiness(text: string): DtsFieldKey | null {
  if (/место для гр\.?\s*17/i.test(text)) return 'dtsPlace'
  if (/гр\.?\s*7\s*«Причины выбора метода»/i.test(text)) return 'dtsReason'
  return null
}
