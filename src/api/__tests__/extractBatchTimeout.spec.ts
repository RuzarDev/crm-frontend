import { describe, expect, it } from 'vitest'
import { extractBatchTimeoutMs } from '../import40'

const fileOf = (size: number) => ({ size }) as File

describe('extractBatchTimeoutMs', () => {
  it('без новых файлов ждёт только сервер', () => {
    expect(extractBatchTimeoutMs([])).toBe(220000)
  })

  it('прибавляет загрузку из расчёта 1 Мбит/с', () => {
    // 160 МБ — пакет из 5 сканов: 1280 с на загрузку и 220 с на сервер.
    expect(extractBatchTimeoutMs([fileOf(100_000_000), fileOf(60_000_000)])).toBe(1_500_000)
  })
})
