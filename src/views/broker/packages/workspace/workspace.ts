// Чистая логика «Разбора поезда» (редизайн, волна 4в): куда привязан файл, фильтры, уровни файлов, пробелы партии.
import type {
  DocumentPackageClientConsolidationDto,
  DocumentPackageContainerDto,
  DocumentPackageDto,
  DocumentPackageFileDto,
} from '@/types/api'

export type FileFilter = 'all' | 'free' | 'linked'

export type LinkTarget =
  | { kind: 'none' }
  | { kind: 'container'; containerId: string }
  | { kind: 'partia'; containerId: string; partiaId: string }

/** Контейнер, в котором лежит партия; null — партии нет в пакете. */
export function partiaContainer(pkg: DocumentPackageDto | null | undefined, partiaId: string): DocumentPackageContainerDto | null {
  return pkg?.containers.find((c) => c.consolidations.some((p) => p.id === partiaId)) ?? null
}

const findPartia = (pkg: DocumentPackageDto, partiaId: string): DocumentPackageClientConsolidationDto | null => {
  for (const c of pkg.containers) {
    const p = c.consolidations.find((x) => x.id === partiaId)
    if (p) return p
  }
  return null
}

/**
 * Куда привязан файл. У файла партии контейнер может быть не указан (инвойсы из формы партии привязываются
 * без него) — тогда он берётся из пакета, если пакет передан; иначе пустая строка.
 */
export function fileTarget(f: DocumentPackageFileDto, pkg?: DocumentPackageDto | null): LinkTarget {
  if (f.clientConsolidationId) {
    const containerId = f.containerId || partiaContainer(pkg, f.clientConsolidationId)?.id || ''
    return { kind: 'partia', containerId, partiaId: f.clientConsolidationId }
  }
  if (f.containerId) return { kind: 'container', containerId: f.containerId }
  return { kind: 'none' }
}

const isFree = (f: DocumentPackageFileDto) => !f.containerId && !f.clientConsolidationId

/** Файлы по сегменту: «Свободные» — не привязаны ни к контейнеру, ни к партии. */
export function filterFiles(files: DocumentPackageFileDto[], f: FileFilter): DocumentPackageFileDto[] {
  if (f === 'free') return files.filter(isFree)
  if (f === 'linked') return files.filter((x) => !isFree(x))
  return files.slice()
}

export function fileCounts(files: DocumentPackageFileDto[]): Record<FileFilter, number> {
  const free = files.filter(isFree).length
  return { all: files.length, free, linked: files.length - free }
}

/** Номер контейнера ISO 6346 — «MRSU 488584 9»; всё прочее (внутренние, китайские номера) — как есть. */
export function formatContainerNumber(n: string): string {
  const compact = n.replace(/\s+/g, '').toUpperCase()
  const m = /^([A-Z]{4})(\d{6})(\d)$/.exec(compact)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : n
}

/** Подпись «куда привязан» в строке файла: номер контейнера или клиент партии; свободный или ссылка в никуда — null. */
export function targetLabel(pkg: DocumentPackageDto, f: DocumentPackageFileDto): string | null {
  const target = fileTarget(f, pkg)
  if (target.kind === 'partia') return findPartia(pkg, target.partiaId)?.clientName ?? null
  if (target.kind === 'container') {
    const c = pkg.containers.find((x) => x.id === target.containerId)
    return c ? formatContainerNumber(c.containerNumber) : null
  }
  return null
}

/**
 * Тело PATCH .../files/{id}/link. documentType файла сохраняется: сервер перезаписывает его при каждой привязке,
 * и без него инвойс переставал быть инвойсом (B13.2).
 */
export function linkBody(
  target: LinkTarget,
  file: DocumentPackageFileDto,
): { containerId: string | null; clientConsolidationId: string | null; documentType: string | null } {
  const documentType = file.documentType ?? null
  if (target.kind === 'partia') return { containerId: target.containerId || null, clientConsolidationId: target.partiaId, documentType }
  if (target.kind === 'container') return { containerId: target.containerId, clientConsolidationId: null, documentType }
  return { containerId: null, clientConsolidationId: null, documentType }
}

/** Файлы уровня контейнера (ЖД накладная): привязаны к контейнеру, но не к его партиям. */
export function containerFiles(pkg: DocumentPackageDto, containerId: string): DocumentPackageFileDto[] {
  return pkg.files.filter((f) => f.containerId === containerId && !f.clientConsolidationId)
}

export function partiaFiles(pkg: DocumentPackageDto, partiaId: string): DocumentPackageFileDto[] {
  return pkg.files.filter((f) => f.clientConsolidationId === partiaId)
}

export type PartiaGap = 'client' | 'shipper' | 'consignee' | 'goods'

const blank = (v: string | null | undefined) => !(v ?? '').trim()

/** Чего не хватает партии для строки реестра (подсказка «не хватает …»). */
export function partiaGaps(c: DocumentPackageClientConsolidationDto): PartiaGap[] {
  const gaps: PartiaGap[] = []
  if (blank(c.clientName)) gaps.push('client')
  if (blank(c.shipper?.name)) gaps.push('shipper')
  if (blank(c.consignee?.name)) gaps.push('consignee')
  if (!c.goodsItems?.length) gaps.push('goods')
  return gaps
}

/** «n товаров · k док.» — товары и документы гр.44. */
export function partiaSummary(c: DocumentPackageClientConsolidationDto): { goods: number; docs: number } {
  return { goods: c.goodsItems?.length ?? 0, docs: c.doc44Items?.length ?? 0 }
}

export function packageCounts(pkg: DocumentPackageDto): { containers: number; partias: number } {
  return {
    containers: pkg.containers.length,
    partias: pkg.containers.reduce((n, c) => n + c.consolidations.length, 0),
  }
}
