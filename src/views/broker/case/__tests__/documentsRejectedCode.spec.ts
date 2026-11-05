// «Из документов» (05.11.2026): код не из справочника ТН ВЭД не попадает в гр. 33, а остаётся у своего товара в теле создания
// ДТ — подсказка под пустой графой. Весь путь: разбор → проверка кодов → товары ДТ → тело POST.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Import40ExtractionResult } from '@/api/import40'
import { prepareDocumentsDeclaration } from '../steps/documentsImport'

const checkCodes = vi.fn()
vi.mock('@/api/tnved', async (orig) => ({
  ...(await orig<typeof import('@/api/tnved')>()),
  tnvedApi: { checkCodes: (...a: unknown[]) => checkCodes(...a) },
}))
vi.mock('@/api/partyRefs', () => ({ partyRefsApi: { search: vi.fn(async () => ({ data: [] })) } }))

const extraction = (codes: (string | null)[]): Import40ExtractionResult => ({
  declaration: { goodsItems: codes.map((tnvedCode, i) => ({ description: `ТОВАР ${i + 1}`, tnvedCode, grossWeightKg: 10 + i })) },
  warnings: [],
  conflicts: [],
} as unknown as Import40ExtractionResult)

const valid = new Set(['7323990000'])

beforeEach(() => {
  checkCodes.mockReset().mockImplementation(async (codes: string[]) => ({
    data: codes.map((code) => ({ code, valid: valid.has(code), name: valid.has(code) ? 'НАЗВАНИЕ' : null, unitCode: null })),
  }))
})

describe('documentsImport: отброшенный код остаётся у своего товара', () => {
  it('разные коды, один код у двух товаров, действующий и пустой — каждый на своей строке', async () => {
    const { body, notes } = await prepareDocumentsDeclaration(
      extraction(['9401719000', '7323990000', '9401799000', '9401719000', null]), [], {}, [],
    )
    const goods = body.goodsItems!
    expect(goods.map((g) => g.description)).toEqual(['ТОВАР 1', 'ТОВАР 2', 'ТОВАР 3', 'ТОВАР 4', 'ТОВАР 5'])
    expect(goods.map((g) => g.tnvedCode)).toEqual([null, '7323990000', null, null, null])
    expect(goods.map((g) => g.documentTnvedCode)).toEqual(['9401719000', null, '9401799000', '9401719000', null])
    // Окно замечаний по-прежнему называет отброшенные коды, каждый один раз.
    expect(notes.filter((n) => n.key === 'codesRejected').map((n) => n.params?.code)).toEqual(['9401719000', '9401799000'])
  })

  it('номер инвойса в колонке кода — не код из документа, подсказки нет', async () => {
    const result = { ...extraction(['2026020201']), extras: { invoiceNumber: '2026020201', hintCodes: [], goods: [] } } as unknown as Import40ExtractionResult
    const { body } = await prepareDocumentsDeclaration(result, [], {}, [])
    expect(body.goodsItems![0]).toMatchObject({ tnvedCode: null })
    expect(body.goodsItems![0].documentTnvedCode ?? null).toBeNull()
  })
})
