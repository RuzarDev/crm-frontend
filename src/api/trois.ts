import apiClient from './client'

// ТРОИС — таможенный реестр объектов интеллектуальной собственности (выгрузка КЕДЕН).
export interface TroisItem {
  id: number
  registrationNumber: string
  objectName: string
  rightHolder: string | null
  protectionDoc: string | null
  /** YYYY-MM-DD */
  validUntil: string | null
  trustedPersons: string | null
  letterRef: string | null
  status: string | null
  /** Статус «Действительный» и срок защиты не истёк. */
  isActive: boolean
  /** Только в проверке: exact — название совпало; similar — одно название содержит другое; holder — у знака нет названия, совпал правообладатель. */
  match?: 'exact' | 'similar' | 'holder' | null
  goodsClasses?: string | null
}

export interface TroisCheckItem {
  name: string
  /** false — название-пустышка («без марки»), не проверялось. */
  checked: boolean
  matches: TroisItem[]
}

export interface TroisStatus { total: number; active: number; importedAtUtc: string | null }
export interface TroisImportResult { total: number; added: number; updated: number; removed: number; active: number }

export const troisApi = {
  search: async (q: string): Promise<TroisItem[]> =>
    (await apiClient.get('/ref/trois', { params: { q }, silent: true })).data,
  status: async (opts?: { silent?: boolean }): Promise<TroisStatus> =>
    (await apiClient.get('/ref/trois/status', opts?.silent ? { silent: true } : undefined)).data,
  /** Пакетная проверка названий (торговые марки из ДТ). Подсказка — ошибки молча. */
  check: async (names: string[]): Promise<TroisCheckItem[]> =>
    (await apiClient.post('/ref/trois/check', { names }, { silent: true })).data.items,
  importFile: async (file: File): Promise<TroisImportResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return (await apiClient.post('/ref/trois/import', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })).data
  },
}

/** 2028-08-26 → 26.08.2028 */
export const troisDate = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—'
}

/** «250140031132,ТОО "РЕАКТ", район Есиль, …» → «ТОО "РЕАКТ" (БИН 250140031132)»: имя без адреса. */
export const troisTrustedShort = (raw: string | null | undefined): string => {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const m = /^(\d{12})\s*,\s*(.*)$/s.exec(s)
  const bin = m?.[1]
  const rest = (m ? m[2] : s).trim()
  // Имя обычно заканчивается закрывающей кавычкой; иначе — до первой запятой.
  const q = /^([^"«]*["«][^"»]*["»])/.exec(rest)
  let name = q ? q[1] : rest.split(',')[0]
  if (name.length > 90) name = name.slice(0, 90) + '…'
  return bin ? `${name.trim()} (БИН ${bin})` : name.trim()
}
