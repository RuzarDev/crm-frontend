// Лимит одного файла документа (клиента, заявки, реестра, пакетов) — как на сервере: ReestrDocumentOptions.MaxFileSizeBytes.
// 02.11.2026: 25 → 100 МБ (владелец: «ограничение 25, больше файлы не даёт загрузить»). Одна константа на все загрузки —
// подсказки «до N МБ» и проверка размера берут её отсюда. Разбор инвойса в транзите (10 МБ) — свой предел, не этот.
export const DOC_MAX_MB = 100
export const DOC_MAX_BYTES = DOC_MAX_MB * 1024 * 1024

/** Файл больше лимита документа. */
export const isDocTooBig = (f: { size: number }): boolean => f.size > DOC_MAX_BYTES

/** Код отказа сервера: пакет больше предела Zircon AI («Из документов», «Сверить заново»), 422 с title этого кода. */
export const AI_PACKAGE_TOO_LARGE = 'AiExtraction.PackageTooLarge'

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * Понятный текст отказа по размеру при распознавании: 422 AiExtraction.PackageTooLarge (Zircon AI не принял пакет) и
 * 413 (сервер или nginx не приняли сам запрос). Иначе — null: вызывающий показывает свой общий текст.
 */
export const uploadTooLargeText = (e: unknown, t: Translate): string | null => {
  const res = (e as { response?: { status?: number; data?: unknown } } | null)?.response
  if (!res) return null
  if (res.status === 413) return t('errors.fileTooLarge', { mb: DOC_MAX_MB })
  const data = (res.data ?? {}) as { title?: unknown; limitMb?: unknown; filesSaved?: unknown }
  if (res.status !== 422 || data.title !== AI_PACKAGE_TOO_LARGE) return null
  const text = typeof data.limitMb === 'number'
    ? t('broker.case.declaring.batch.tooLargeForAiMb', { mb: data.limitMb })
    : t('broker.case.declaring.batch.tooLargeForAi')
  return data.filesSaved === true ? `${text}. ${t('broker.case.declaring.batch.filesSaved')}` : text
}
