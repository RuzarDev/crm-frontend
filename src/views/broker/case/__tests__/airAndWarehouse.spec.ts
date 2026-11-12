import { describe, expect, it } from 'vitest'
import type { Import40DeclarationUpsert, Import40ExtractionExtras } from '@/api/import40'
import { applyAirAndWarehouse, type DocumentsNote } from '../steps/documentsImport'

// 11.11.2026 (правки Несибели, авиа-пакет): справка экспедитора — гр. 25/26 = 40, ДХТ в гр. 44, склад из реестра СВХ в гр. 30.
const body = (): Import40DeclarationUpsert => ({ declarationNumber: null, doc44Items: [] }) as unknown as Import40DeclarationUpsert
const extras = (o: Partial<Import40ExtractionExtras>): Import40ExtractionExtras => ({ hintCodes: [], goods: [], ...o })

describe('applyAirAndWarehouse', () => {
  it('авиа: гр. 25/26 = 40, ДХТ 09026, склад по НИКАД; заявка «Авто» — замечание', () => {
    const b = body()
    const notes: DocumentsNote[] = []
    applyAirAndWarehouse(b, extras({
      air: true, flightNumber: 'TK350', dhtNumber: '55301/290926/093456', dhtDate: '2026-09-29',
      warehouse: { nikad: 'KZ07VSY00000532', name: 'АО «Аэропорт»', customsOfficeCode: '55300', source: 'document', candidates: [] },
    }), { transportMode: 1 }, notes)
    expect(b.borderTransportModeCode).toBe('40')
    expect(b.inlandTransportModeCode).toBe('40')
    expect(b.doc44Items).toEqual([expect.objectContaining({ docTypeCode: '09026', docNumber: '55301/290926/093456', docDate: '2026-09-29' })])
    expect([b.goodsLocationCode, b.goodsLocationRegisterNumber, b.goodsLocationCountryCode, b.goodsLocationCustomsOfficeCode])
      .toEqual(['11', 'KZ07VSY00000532', 'KZ', '55300'])
    expect(notes.map((n) => n.key)).toEqual(['airFromDocs', 'warehouseFromDocs'])
  })

  it('не авиа: ДХТ 09025, гр. 25/26 не трогаем; ДХТ уже есть — не дублируем', () => {
    const b = body()
    b.doc44Items = [{ docTypeCode: '09025', docTypeName: null, docNumber: '55301 / 290926 / 093456', docDate: null }]
    applyAirAndWarehouse(b, extras({ dhtNumber: '55301/290926/093456' }), { transportMode: 1 }, [])
    expect(b.borderTransportModeCode).toBeUndefined()
    expect(b.doc44Items).toHaveLength(1)
  })

  it('несколько складов владельца — гр. 30 пусто, список в замечании', () => {
    const b = body()
    const notes: DocumentsNote[] = []
    applyAirAndWarehouse(b, extras({ warehouse: { nikad: null, name: 'Digital Silk Road Company', source: 'ambiguous', candidates: [
      { nikad: 'KZ49VSY00005499', address: 'обл. Жетісу, р-н Алакольский, п. Достык, уч. кв. 060, зд. 87' },
      { nikad: 'KZ60VSY00001615', address: 'область Жетісу, Панфиловский район, село Пенжим' },
    ] } }), { transportMode: 1 }, notes)
    expect(b.goodsLocationRegisterNumber).toBeUndefined()
    expect(notes[0].key).toBe('warehouseChoose')
    expect(String(notes[0].params?.list)).toContain('KZ49VSY00005499')
  })
})
