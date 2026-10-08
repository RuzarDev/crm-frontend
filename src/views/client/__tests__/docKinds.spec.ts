import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import { DOC_CHECKLIST, isDocKind, missingRequired } from '../docKinds'

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

describe('словари чек-листа', () => {
  const dicts = { ru, kk, en } as Record<string, any>
  const keys = [...DOC_CHECKLIST.map((d) => d.key), 'other']
  for (const [lang, d] of Object.entries(dicts)) {
    it(`${lang}: имена видов документов`, () => {
      for (const k of keys) expect(d.client.docKind[k].name, `${lang} ${k}`).toBeTruthy()
    })
    it(`${lang}: подсказки и признаки обязательности`, () => {
      // у инвойса и упаковочного листа подсказки нет
      for (const k of ['transport', 'contract', 'origin', 'conformity', 'permit']) expect(d.client.docKind[k].hint, `${lang} ${k}`).toBeTruthy()
      for (const n of ['required', 'ifAny', 'ifRequired']) expect(d.client.docNeed[n], `${lang} ${n}`).toBeTruthy()
    })
  }
})
