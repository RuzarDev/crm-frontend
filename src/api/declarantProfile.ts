import apiClient from './client'

// Профиль декларанта (гр.54): ФИО/доверенность/удостоверение текущего пользователя.
export interface DeclarantProfileDto {
  fullName: string | null
  position: string | null
  phone: string | null
  /** ИИН — ccecd:PersonId в КЕДЕН-XML (кто заполнил ДТ) */
  iin: string | null
  powerOfAttorneyNumber: string | null
  powerOfAttorneyDate: string | null
  powerOfAttorneyValidUntil: string | null
  idDocTypeCode: string | null
  idDocNumber: string | null
  idDocIssueDate: string | null
  idDocIssuedBy: string | null
  idDocCountryCode: string | null
  /** 02.11.2026 (F3): короткое название своей организации из реквизитов — только чтение; не заполнены — null. */
  organizationName?: string | null
}

/** Доверенность клиента, где сотрудник — представитель (02.11.2026, «Мои доверенности»). status — как у документа клиента. */
export interface MyPoaRow {
  id: string
  clientId: string
  clientName: string
  number: string
  year: number
  status: number
  isSingleUse: boolean
  generatedAtUtc: string
  validUntilUtc: string | null
  daysLeft: number | null
  expiringSoon: boolean
  revokedAtUtc: string | null
  /** Есть подписанный файл (ЭЦП-контейнер) — «Скачать» отдаёт его. */
  hasSignedFile: boolean
}

/** iinMissing — в профиле нет ИИН, сверить не с чем. */
export interface MyPoas { iinMissing: boolean; items: MyPoaRow[] }

const fileNameOf = (cd: string, fallback: string) => {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="?([^";]+)"?/i.exec(cd)
  if (!m) return fallback
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

export const myPoasApi = {
  list: async (opts?: { silent?: boolean }): Promise<MyPoas> =>
    (await apiClient.get<MyPoas>('/import40/my-poas', { silent: opts?.silent })).data,
  /** Подписанный файл, если есть; docx: true — сформированный документ (.docx). */
  download: async (id: string, docx = false): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get(`/import40/my-poas/${encodeURIComponent(id)}/download`, {
      responseType: 'blob',
      params: docx ? { format: 'docx' } : undefined,
    })
    return { blob: res.data as Blob, fileName: fileNameOf(String(res.headers?.['content-disposition'] ?? ''), docx ? 'Доверенность.docx' : 'Доверенность') }
  },
}

export const declarantProfileApi = {
  // silent — ошибку показывает сама карточка (состояние ошибки с «Повторить»), общий тост не нужен.
  get: async (opts?: { silent?: boolean }): Promise<DeclarantProfileDto> =>
    (await apiClient.get<DeclarantProfileDto>('/import40/declarant-profile', { silent: opts?.silent })).data,
  update: async (data: DeclarantProfileDto, opts?: { silent?: boolean }): Promise<DeclarantProfileDto> =>
    (await apiClient.put<DeclarantProfileDto>('/import40/declarant-profile', data, { silent: opts?.silent })).data,
}
