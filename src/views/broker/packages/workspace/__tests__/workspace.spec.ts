import { describe, expect, it } from 'vitest'
import {
  containerFiles,
  fileCounts,
  fileTarget,
  filterFiles,
  formatContainerNumber,
  linkBody,
  packageCounts,
  partiaFiles,
  partiaGaps,
  partiaSummary,
  targetLabel,
} from '../workspace'
import { container, file, fullPartia, pkg } from '../../partia/__tests__/packageFixture'

const ids = (files: { id: string }[]) => files.map((f) => f.id)

describe('fileTarget', () => {
  it('свободный файл — none', () => {
    expect(fileTarget(file())).toEqual({ kind: 'none' })
  })

  it('уровень контейнера — container', () => {
    expect(fileTarget(file({ containerId: 'c1' }))).toEqual({ kind: 'container', containerId: 'c1' })
  })

  it('файл партии — partia; контейнер — из файла или, если его нет, из пакета', () => {
    expect(fileTarget(file({ containerId: 'c1', clientConsolidationId: 'p1' }))).toEqual({ kind: 'partia', containerId: 'c1', partiaId: 'p1' })
    // инвойс из формы партии привязан без контейнера
    const inv = file({ clientConsolidationId: 'p1', documentType: 'invoice' })
    expect(fileTarget(inv, pkg())).toEqual({ kind: 'partia', containerId: 'c1', partiaId: 'p1' })
    expect(fileTarget(inv)).toEqual({ kind: 'partia', containerId: '', partiaId: 'p1' })
  })
})

describe('фильтры и счётчики', () => {
  const files = pkg().files

  it('все / свободные / привязанные', () => {
    expect(ids(filterFiles(files, 'all'))).toEqual(['f-free', 'f-rail', 'f-inv', 'f-tsd'])
    expect(ids(filterFiles(files, 'free'))).toEqual(['f-free'])
    expect(ids(filterFiles(files, 'linked'))).toEqual(['f-rail', 'f-inv', 'f-tsd'])
  })

  it('счётчики', () => {
    expect(fileCounts(files)).toEqual({ all: 4, free: 1, linked: 3 })
    expect(fileCounts([])).toEqual({ all: 0, free: 0, linked: 0 })
  })
})

describe('linkBody', () => {
  it('инвойс остаётся инвойсом при перепривязке (B13.2)', () => {
    const inv = file({ id: 'f-inv', clientConsolidationId: 'p1', documentType: 'invoice' })
    expect(linkBody({ kind: 'container', containerId: 'c2' }, inv)).toEqual({ containerId: 'c2', clientConsolidationId: null, documentType: 'invoice' })
    expect(linkBody({ kind: 'none' }, inv)).toEqual({ containerId: null, clientConsolidationId: null, documentType: 'invoice' })
  })

  it('партия — контейнер и партия; у обычного файла documentType null', () => {
    expect(linkBody({ kind: 'partia', containerId: 'c1', partiaId: 'p1' }, file())).toEqual({ containerId: 'c1', clientConsolidationId: 'p1', documentType: null })
  })

  it('партия без известного контейнера — containerId null, а не пустая строка', () => {
    expect(linkBody({ kind: 'partia', containerId: '', partiaId: 'p1' }, file())).toEqual({ containerId: null, clientConsolidationId: 'p1', documentType: null })
  })
})

describe('targetLabel', () => {
  const p = pkg()

  it('свободный — null', () => {
    expect(targetLabel(p, file())).toBeNull()
  })

  it('контейнер — номер в формате «MRSU 488584 9»', () => {
    expect(targetLabel(p, file({ containerId: 'c1' }))).toBe('MRSU 488584 9')
    expect(targetLabel(p, file({ containerId: 'c2' }))).toBe('TCLU 123456 7')
  })

  it('партия — название клиента (и без контейнера в файле)', () => {
    expect(targetLabel(p, file({ clientConsolidationId: 'p1' }))).toBe('kazakhmys')
    expect(targetLabel(p, file({ containerId: 'c1', clientConsolidationId: 'p1' }))).toBe('kazakhmys')
  })

  it('ссылка на удалённое — null', () => {
    expect(targetLabel(p, file({ containerId: 'gone' }))).toBeNull()
    expect(targetLabel(p, file({ clientConsolidationId: 'gone' }))).toBeNull()
  })
})

describe('formatContainerNumber', () => {
  it('стандартный номер ISO 6346 — «XXXX 123456 7», иначе как есть', () => {
    expect(formatContainerNumber('MRSU4885849')).toBe('MRSU 488584 9')
    expect(formatContainerNumber(' mrsu 488584 9 ')).toBe('MRSU 488584 9')
    expect(formatContainerNumber('CN-77')).toBe('CN-77')
    expect(formatContainerNumber('')).toBe('')
  })
})

describe('уровни файлов', () => {
  const p = pkg()

  it('уровень контейнера — без файлов его партий', () => {
    expect(ids(containerFiles(p, 'c1'))).toEqual(['f-rail'])
    expect(containerFiles(p, 'c2')).toEqual([])
  })

  it('файлы партии — с контейнером и без', () => {
    expect(ids(partiaFiles(p, 'p1'))).toEqual(['f-inv', 'f-tsd'])
    expect(partiaFiles(p, 'nope')).toEqual([])
  })
})

describe('partiaGaps', () => {
  it('полная партия — пробелов нет', () => {
    expect(partiaGaps(fullPartia())).toEqual([])
  })

  it('все пробелы — в порядке клиент, отправитель, получатель, товары', () => {
    expect(partiaGaps(fullPartia({ clientName: '  ', shipper: null, consignee: undefined, goodsItems: [] })))
      .toEqual(['client', 'shipper', 'consignee', 'goods'])
  })

  it('стороны без названия считаются незаполненными, даже с адресом', () => {
    expect(partiaGaps(fullPartia({ shipper: { name: ' ', countryCode: 'CN' } }))).toEqual(['shipper'])
    expect(partiaGaps(fullPartia({ consignee: { name: null, city: 'Алматы' } }))).toEqual(['consignee'])
  })

  it('по отдельности: клиент, товары', () => {
    expect(partiaGaps(fullPartia({ clientName: '' }))).toEqual(['client'])
    expect(partiaGaps(fullPartia({ goodsItems: [] }))).toEqual(['goods'])
  })
})

describe('итоги', () => {
  it('partiaSummary — товары и документы гр.44', () => {
    expect(partiaSummary(fullPartia())).toEqual({ goods: 2, docs: 1 })
    expect(partiaSummary(fullPartia({ goodsItems: [], doc44Items: [] }))).toEqual({ goods: 0, docs: 0 })
  })

  it('packageCounts — контейнеры и партии', () => {
    expect(packageCounts(pkg())).toEqual({ containers: 2, partias: 1 })
    const two = pkg({ containers: [container(), container({ id: 'c2', consolidations: [fullPartia({ id: 'p2' }), fullPartia({ id: 'p3' })] })] })
    expect(packageCounts(two)).toEqual({ containers: 2, partias: 3 })
    expect(packageCounts(pkg({ containers: [] }))).toEqual({ containers: 0, partias: 0 })
  })
})
