import apiClient from './client'
import type { UtilizationFee } from './nationalLists'

// Себестоимость поставки для клиента после выпуска (17.10), всё в тенге: ТиН из ДТ (гр. В — уплачено, иначе гр. 47),
// услуги AQNIET, СВХ, сертификаты и транспорт клиента, утильсбор оператору РОП (не в гр. 47: ввод клиента или расчёт
// по ТС из ДТ по сверенной ставке). missing — чего ещё нет (итог неполный).
// Фрахт (очередь 4): счета перевозчиков по поставке; есть счета — ручной transportKzt = «прочий транспорт», 'freight' в
// missing — у счёта нет курса НБ РК.
export type ShipmentCostPart = 'customs' | 'broker' | 'svh' | 'certificates' | 'transport' | 'utilization' | 'freight'

/** Счёт перевозчика по поставке в себестоимости: сумма в валюте и в тенге по курсу НБ РК на дату счёта. */
export interface ShipmentCostFreight {
  id: string
  carrierId: string
  carrierName: string
  number: string
  invoiceDate: string
  amount: number
  currency: string
  paid: boolean
  /** null — нет курса на дату счёта. */
  amountKzt: number | null
  rateOfficial: boolean
}

/** Утильсбор по товару ДТ под утильсбором (8701–8705, 8429, 8433 5x): по ТС (VIN) или товару целиком. */
export interface ShipmentCostUtilizationLine {
  declarationId: string
  declarationNumber: string
  goodsNumber: number
  code: string
  vin: string | null
  fee: UtilizationFee
}

export interface ShipmentCostDeclaration {
  declarationId: string
  number: string
  /** 'B' — гр. В (уплачено); '47' — начислено по товарам, гр. В ещё не записана. */
  source: 'B' | '47'
  feesKzt: number
  dutyKzt: number
  vatKzt: number
  otherKzt: number
  totalKzt: number
}

export interface ShipmentCostInvoice {
  id: string
  number: string
  year: number
  total: number
  paid: boolean
}

export interface ShipmentCostDto {
  caseId: string
  caseNumber: string
  cargo: string
  releasedAtUtc: string | null
  customsKzt: number | null
  declarations: ShipmentCostDeclaration[]
  brokerKzt: number | null
  brokerInvoices: ShipmentCostInvoice[]
  svhKzt: number | null
  svhInvoiceNumber: string
  certificatesKzt: number | null
  transportKzt: number | null
  note: string
  totalKzt: number
  missing: ShipmentCostPart[]
  clientUpdatedAtUtc: string | null
  /** Утильсбор в итоге: ввод клиента или сумма сверенных расчётов; null — нет ТС или суммы. */
  utilizationKzt?: number | null
  /** 'input' — ввёл клиент, 'calc' — расчёт. */
  utilizationSource?: 'input' | 'calc' | null
  utilizationInputKzt?: number | null
  /** Строки расчёта; null — в ДТ нет ТС под утильсбором. */
  utilizationLines?: ShipmentCostUtilizationLine[] | null
  /** Фрахт по счетам перевозчиков; null — счетов нет. */
  freightKzt?: number | null
  freightInvoices?: ShipmentCostFreight[] | null
}

export interface ShipmentCostUpdate {
  certificatesKzt: number | null
  transportKzt: number | null
  note: string
  utilizationKzt?: number | null
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const shipmentCostApi = {
  // silent — блок необязателен на экране: сбой — блок показывает свою ошибку с «Повторить», без тоста.
  get: async (caseId: string): Promise<ShipmentCostDto> =>
    (await apiClient.get<ShipmentCostDto>(`/import40/${encodeURIComponent(caseId)}/cost`, { silent: true })).data,
  update: async (caseId: string, body: ShipmentCostUpdate): Promise<ShipmentCostDto> =>
    (await apiClient.put<ShipmentCostDto>(`/import40/${encodeURIComponent(caseId)}/cost`, body)).data,
  /** Excel себестоимости: по одной поставке (caseId) или по всем выпущенным; язык листов — как интерфейс. */
  xlsx: async (lang: string, caseId?: string): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get('/import40/client/costs/xlsx', {
      params: caseId ? { caseId, lang } : { lang },
      responseType: 'blob',
    })
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    const fileName = m ? decodeURIComponent(m[1]) : caseId ? 'cost.xlsx' : 'costs.xlsx'
    return { blob: new Blob([res.data as BlobPart], { type: XLSX_TYPE }), fileName }
  },
}
