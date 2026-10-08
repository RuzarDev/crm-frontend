import type { DocumentPackageStatus } from '@/types/api'

// Чистая логика «Пакетов документов» (редизайн, волна 3а): права на файлы, фильтрация, счётчики, формат.

/**
 * Можно ли загружать и удалять файлы пакета — так же, как решает сервер (CanModifyFiles):
 * администратор; проверяющий (packages.manage) — в любом статусе; экспедитор — пока пакет «Загружен» или «Нужна правка».
 */
export function canModifyFiles(o: { role: string | null | undefined; canReview: boolean; status: DocumentPackageStatus }): boolean {
  const role = (o.role ?? '').trim().toLowerCase()
  if (role === 'administrator' || o.canReview) return true
  return role === 'expeditor' && (o.status === 'uploaded' || o.status === 'needsFix')
}
