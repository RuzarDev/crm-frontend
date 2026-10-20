import { inject, type InjectionKey, type Ref } from 'vue'
import type { Import40FileDto } from '@/api/import40'

// «Перевести (ИИ)» — у документов клиента и сканов с границы (не у служебных файлов AQNIET и не у фото погрузки).
// Фото документа (JPG/PNG) тоже можно нажать: сервер честно ответит, что без распознанного текста перевод невозможен.
const SECTIONS: ReadonlySet<string> = new Set(['documents', 'border-scans', 'extraction-batch'])
const EXT = /\.(pdf|docx|xlsx|jpe?g|png)$/i

export const canTranslate = (f: Pick<Import40FileDto, 'section' | 'originalFileName'>): boolean =>
  SECTIONS.has(f.section) && EXT.test(f.originalFileName)

/** Переводы файлов карточки заявки сотрудника: одна загрузка списка на карточку (provide в CaseView, inject в списках файлов). */
export interface CaseTranslations { ids: Ref<Set<string>>; mark: (fileId: string) => void }
export const CASE_TRANSLATIONS: InjectionKey<CaseTranslations> = Symbol('caseTranslations')
export const injectCaseTranslations = (): CaseTranslations | null => inject(CASE_TRANSLATIONS, null)
