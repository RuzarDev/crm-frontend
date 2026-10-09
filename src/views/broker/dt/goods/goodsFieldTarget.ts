// Поле товара для пункта «До подачи» (волна 6б). Номер графы не однозначен: гр. 31 — и описание, и места, гр. 33 — и код
// ТН ВЭД, и коды запретов/ограничений, и ОИС. Поэтому пункт про товар сопоставляется с ПОЛЕМ по тексту сервера
// (KedenXmlReadiness, «Товар N: …»), а поле в редакторе помечено data-goods-field="<свойство товара>".
// DtPage.goTo ищет сначала [data-goods-field=…] внутри [data-goods-index=N], затем — поле графы [data-graph=…]: первое
// подсвеченное (предупреждение/ошибка у поля, напр. гр. 36 вне списка КЕДЕН), иначе первое.
// Новые секции (Tasks 4–6): поле с ключом из этой таблицы — data-goods-field="<ключ>"; новый текст сервера — строка сюда.

/** [образец текста пункта, ключ поля]; порядок важен — первое совпадение. */
const RULES: readonly (readonly [RegExp, string])[] = [
  // гр. 36/37 вне списков КЕДЕН: «КЕДЕН при процедуре ИМ40 не предлагает гр.36 пошлина «X» (есть: …), …» — поле первого
  // названного кода (сервер: KedenXmlReadiness.OffKedenListItems). До остальных правил: в тексте бывают «НДС», «пошлина».
  [/не предлагает\s+гр\.?\s*36\s+сбор/iu, 'prefClearanceCode'],
  [/не предлагает\s+гр\.?\s*36\s+пошлина/iu, 'prefDutyCode'],
  [/не предлагает\s+гр\.?\s*36\s+акциз/iu, 'prefExciseCode'],
  [/не предлагает\s+гр\.?\s*36\s+НДС/iu, 'prefVatCode'],
  [/не предлагает\s+гр\.?\s*37\s+предшествующая/iu, 'previousProcedureCode'],
  [/не предлагает\s+гр\.?\s*37\s+особенность/iu, 'goodsMoveFeatureCode'],
  // гр. 33: коды запретов и ограничений (КЕДЕН) — до кода ТН ВЭД: «гр.33 — КЕДЕН для ТН ВЭД … не примет …».
  [/коды запретов|коды гр\.?\s*33|гр\.?\s*33\s*—/iu, 'prohibitionCode'],
  [/интеллектуальной собственности/iu, 'oisIndicatorCode'],
  [/код\s*ТН\s*ВЭД/iu, 'tnvedCode'],
  // «количество грузовых мест или частично занятых мест» — не хватает мест вообще: главное поле — «Мест»;
  // только «частично занятых» (без «грузовых мест») — поле частично занятых мест (упаковка).
  [/грузовых мест/iu, 'packagesCount'],
  [/частично занят/iu, 'cargoPartQuantity'],
  [/доп\.\s*сведения/iu, 'extras'],
  [/описание/iu, 'description'],
  [/вес брутто/iu, 'grossWeightKg'],
  [/вес нетто/iu, 'netWeightKg'],
  [/дополнительной единице/iu, 'quantity'],
  [/фактурная стоимость/iu, 'customsValue'],
  [/таможенная стоимость в тенге/iu, 'customsValueKzt'],
  [/метод определения таможенной стоимости/iu, 'valuationMethodCode'],
  [/строки платежа|гр\.?\s*47/iu, 'payments'],
]

// «Товар N: гр.31 доп. сведения — <проблема>; <проблема>…» (KedenXmlReadiness.ExtrasProblems): один пункт на товар, поле —
// по ПЕРВОЙ проблеме (рег. № ОИС, 31.2, маркировка — в своих разделах; остальное — блоки «Доп. сведений»).
const EXTRAS_RE = /доп\.\s*сведения\s*—\s*(.+)$/isu
const EXTRAS_RULES: readonly (readonly [RegExp, string])[] = [
  [/^рег\.\s*номер ОИС/iu, 'oisRegNumber'],
  [/^упаковка\/поддоны/iu, 'packages'],
  [/^маркировка/iu, 'markings'],
  [/^стандарт/iu, 'standardName'],
  [/^период поставки/iu, 'period'],
  [/^инвестпроект/iu, 'invest'],
  [/^прослеживаемость/iu, 'traceable'],
  [/^акцизные марки/iu, 'exciseStamps'],
  [/^автомобиль/iu, 'vehicles'],
]

/** Ключ поля товара (свойство Import40GoodsItemInput или раздел: payments, extras) по тексту пункта; null — не знаем. */
export function goodsFieldFromReadiness(text: string | null | undefined): string | null {
  const t = text ?? ''
  const extras = EXTRAS_RE.exec(t)
  if (extras) {
    const first = extras[1].trim()
    for (const [re, key] of EXTRAS_RULES) if (re.test(first)) return key
    return 'extras'
  }
  for (const [re, key] of RULES) if (re.test(t)) return key
  return null
}
