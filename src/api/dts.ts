import apiClient from './client'

// ДТС (добавочный лист декларации таможенной стоимости) — Task 11.
// Типы выверены по бэкенду (branch feature/dts, crm-server):
// CRM.API.Features.Import40.Dts.DtsModels.cs (DtsSheet/DtsParty/DtsDocRef/
// DtsGoodsColumn/DtsCurrencyLine) и DtsEndpoints.cs (DtsViewDto). ASP.NET
// сериализует camelCase, DateOnly → "yyyy-MM-dd".

export interface DtsDocRef {
  kindCode: string
  name: string
  number: string
  date: string | null
}

export interface DtsParty {
  name: string | null
  bin: string | null
  region: string | null
  city: string | null
  street: string | null
  house: string | null
  apt: string | null
  countryName: string | null
}

export interface DtsCurrencyLine {
  goodsNumber: number
  box: string
  currency: string
  amount: number
  rate: number
}

export interface DtsGoodsColumn {
  number: number
  tnvedCode: string | null
  invoiceCurrency: string
  invoicePrice: number
  invoiceRate: number
  invoicePriceKzt: number
  box12: number
  additions: Record<string, number> // код 13a…19 → ₸ (только ненулевые)
  box20: number
  deductions: Record<string, number> // код 21…23 → ₸ (только ненулевые)
  box24: number
  box25Kzt: number
  box25Usd: number
  declaredCustomsValueKzt: number | null
  currencyLines: DtsCurrencyLine[]
}

export interface DtsSheet {
  formCode: number // 1 | 2
  methodCode: string // "1" | "6"
  baseMethodCode: string | null // "1" для формы 2, иначе null
  referenceDocumentId: string
  registrationNumber: string
  seller: DtsParty
  buyer: DtsParty
  declarant: DtsParty
  incotermsCode: string | null
  incotermsPlace: string | null
  invoices: DtsDocRef[] // гр.4
  contracts: DtsDocRef[] // гр.5
  box6Docs: DtsDocRef[] // гр.6
  // Вопросы 7–9 — эхо тех же dts*-полей формы (Task 3, dtForm), продублированы
  // в ответе сервера для XML/печати. Экран вопросов 7–9 в компоненте биндится
  // напрямую к dtForm (редактируемо), эти поля тут только для полноты типа.
  relation: boolean
  relationPriceInfluence: boolean
  relationApproxValue: boolean
  restriction: boolean
  valueCondition: boolean
  royaltyContract: boolean
  royaltyFee: boolean
  subsequentResale: boolean
  methodReason: string | null
  placeName: string | null // гр.17 «до …»
  addSheets: number
  box10b: string | null
  usdRate: number
  goods: DtsGoodsColumn[]
}

export interface DtsView {
  sheet: DtsSheet
  missing: string[]
  mismatchGoods: number[]
}

const base = (caseId: string, declId: string) =>
  `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declId)}/dts`

const fileName = (cd: string, fallback: string) => {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
  return m ? decodeURIComponent(m[1]) : fallback
}

export const dtsApi = {
  get: async (caseId: string, declId: string): Promise<DtsView> =>
    (await apiClient.get<DtsView>(base(caseId, declId))).data,

  xml: async (caseId: string, declId: string): Promise<{ blob: Blob; fileName: string } | { errors: string[] }> => {
    const res = await apiClient.get(`${base(caseId, declId)}/xml`, { responseType: 'blob', validateStatus: () => true })
    if (res.status === 400) {
      const parsed = JSON.parse(await (res.data as Blob).text()) as { errors?: string[] }
      return { errors: parsed.errors ?? ['Не удалось сформировать XML ДТС'] }
    }
    if (res.status >= 400) throw new Error(String(res.status))
    return { blob: res.data as Blob, fileName: fileName(String(res.headers['content-disposition'] ?? ''), 'dts.xml') }
  },

  pdf: async (caseId: string, declId: string, kind: 'pdf' | 'info-sheet-pdf'): Promise<Blob> => {
    // validateStatus: без него axios на 4xx/5xx кидает reject → срабатывает и
    // глобальный интерцептор apiClient (общий тост), и catch в компоненте —
    // двойной тост с разным текстом. Разбираем ошибку сами и кидаем одно
    // сообщение (напр. «Печать ДТС-2 пока не поддерживается» для формы 2).
    const res = await apiClient.get(`${base(caseId, declId)}/${kind}`, { responseType: 'blob', validateStatus: () => true })
    if (res.status >= 400) {
      let msg = `Не удалось сформировать PDF (${res.status})`
      try {
        const parsed = JSON.parse(await (res.data as Blob).text()) as { message?: string; error?: string }
        msg = parsed.message ?? parsed.error ?? msg
      } catch {
        /* тело не JSON — оставляем сообщение по умолчанию */
      }
      throw new Error(msg)
    }
    return res.data as Blob
  },
}
