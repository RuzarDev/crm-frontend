import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import { DOC_CHECKLIST, guessDocKind, isDocKind, missingRequired } from '../docKinds'

describe('missingRequired', () => {
  it('без файлов — все 4 обязательные позиции', () => {
    expect(missingRequired([]).map((d) => d.key)).toEqual(['invoice', 'transport', 'packing', 'contract'])
  })
  it('учитывает загруженные виды, null игнорирует', () => {
    expect(missingRequired(['invoice', 'packing', null]).map((d) => d.key)).toEqual(['transport', 'contract'])
  })
  it('необязательные позиции не требуются', () => {
    expect(missingRequired(['invoice', 'transport', 'packing', 'contract'])).toEqual([])
  })
})

describe('isDocKind', () => {
  it('принимает известные виды и other', () => {
    expect(isDocKind('invoice')).toBe(true)
    expect(isDocKind('other')).toBe(true)
  })
  it('отвергает прочее', () => {
    expect(isDocKind('foo')).toBe(false)
    expect(isDocKind(null)).toBe(false)
    expect(isDocKind(1)).toBe(false)
  })
})

// 01.11.2026, правки 30.10 п.4: вид файла из «Других документов» по имени.
describe('guessDocKind', () => {
  it('файл из видео клиента и латиница/кириллица в любом регистре', () => {
    expect(guessDocKind('Контракт+от+29.07.2026г (1).pdf')).toBe('contract')
    expect(guessDocKind('CONTRACT_15.pdf')).toBe('contract')
    expect(guessDocKind('Договор поставки.docx')).toBe('contract')
    expect(guessDocKind('Invoice 2026-15.pdf')).toBe('invoice')
    expect(guessDocKind('инвойс.jpg')).toBe('invoice')
    expect(guessDocKind('Счёт 42.pdf')).toBe('invoice')
    expect(guessDocKind('счет_42.pdf')).toBe('invoice')
    expect(guessDocKind('INV-2026-15.pdf')).toBe('invoice')
    expect(guessDocKind('Packing list.xlsx')).toBe('packing')
    expect(guessDocKind('Упаковочный лист.pdf')).toBe('packing')
    expect(guessDocKind('CMR 123.pdf')).toBe('transport')
    expect(guessDocKind('СМГС_вагон.pdf')).toBe('transport')
    expect(guessDocKind('Накладная.pdf')).toBe('transport')
  })
  it('без слова, слово внутри другого и несколько видов — без подсказки', () => {
    expect(guessDocKind('3826576_261028_131924.pdf')).toBeNull()
    expect(guessDocKind('Пересчёт стоимости.pdf')).toBeNull()
    expect(guessDocKind('inventory.xlsx')).toBeNull()
    expect(guessDocKind('Invoice & packing list.pdf')).toBeNull()
  })
})

describe('словари чек-листа', () => {
  const dicts = { ru, kk, en } as Record<string, any>
  const keys = [...DOC_CHECKLIST.map((d) => d.key), 'other']
  for (const [lang, d] of Object.entries(dicts)) {
    it(`${lang}: имена видов документов`, () => {
      for (const k of keys) expect(d.client.docKind[k].name, `${lang} ${k}`).toBeTruthy()
    })
    it(`${lang}: подсказки и признаки обязательности`, () => {
      // у инвойса и упаковочного листа подсказки нет
      for (const k of ['transport', 'contract', 'origin', 'conformity', 'permit', 'certificate']) expect(d.client.docKind[k].hint, `${lang} ${k}`).toBeTruthy()
      for (const n of ['required', 'ifAny', 'ifRequired']) expect(d.client.docNeed[n], `${lang} ${n}`).toBeTruthy()
    })
    // 01.11.2026 (правки 30.10 п.4, 4а, 10): вид файла, подсветка запроса, одно предупреждение, этап проверки.
    it(`${lang}: «Что это за документ?», предупреждение при отправке, «Проверка со стороны таможенных органов»`, () => {
      for (const k of ['asked', 'kindLabel', 'kindPh', 'kindGuessed']) expect(d.client.wizard.docs[k], `${lang} ${k}`).toBeTruthy()
      for (const k of ['title', 'text', 'asked', 'required', 'resp', 'ok', 'cancel']) expect(d.client.wizard.warn[k], `${lang} warn.${k}`).toBeTruthy()
      expect(d.stages.sub.check).not.toMatch(/^(Проверка таможней|Кедендік тексеру|Customs check)$/)
    })
  }
})
