import type { SectionKey } from '../recordModel'

/** Якорь раздела на странице: меню разделов прокручивает к нему (`sec-main`, `sec-goods`, …). */
export const sectionDomId = (key: SectionKey): string => `sec-${key}`
