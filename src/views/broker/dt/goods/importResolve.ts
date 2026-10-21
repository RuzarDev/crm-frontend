// Импорт в ДТ (пакет 21.10.2026, №1 и №9): все коды ТН ВЭД строк импорта проверяются ОДНИМ запросом
// (tnved/check-codes) — действующий ли 10-значный код, его название («Описание из ТН ВЭД») и ДЕИ (куда идёт количество:
// гр. 41 или строка гр. 31). Раньше — по два запроса на код, и импорт 40 товаров упирался в лимит 60/мин.
// Код отбрасывается, если он не 10-значный, не действующий или совпадает цифрами с номером инвойса / контракта /
// транспортного документа («Из документов» записал номер инвойса 2026020201 в код ТН ВЭД, №9). Ответ засевает кэши
// сессии (проверка кода раздела «Товары», ДЕИ карточки) — они не переспрашивают.
import { tnvedApi } from '@/api/tnved'
import { okeiCode } from './editor/okei'
import { seedDei, type TnvedDei } from './editor/tnvedDei'
import { seedTnvedCheck } from './tnvedCodeCheck'

export interface ResolvedCode {
  code: string
  valid: boolean
  /** Название кода из справочника — «Описание из ТН ВЭД». */
  name: string | null
  /** ДЕИ: единица; null — у кода нет ДЕИ. */
  dei: TnvedDei | null
}

export type RejectReason = 'notTenDigits' | 'notInDirectory' | 'docNumber'

export interface ResolveResult {
  byCode: Map<string, ResolvedCode>
  rejected: { code: string; reason: RejectReason }[]
  /** Проверка не удалась (сеть, лимит): коды переносятся как есть, ДЕИ «неизвестна» — количество в строку гр. 31. */
  failed: boolean
}

/** Номера документов, с которыми код не должен совпадать (цифрами). */
export interface DocNumberRefs {
  invoiceNo?: string | null
  contractNo?: string | null
  transportDoc?: string | null
}

const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
/** Код из файла: «7323 99 000 0», «7323.99.000.0» → «7323990000». */
export const normCode = (s: string | null | undefined): string => (s ?? '').replace(/[\s.\-]/g, '')

export async function resolveCodes(codes: readonly (string | null | undefined)[], refs: DocNumberRefs = {}): Promise<ResolveResult> {
  const list = [...new Set(codes.map(normCode).filter(Boolean))]
  const byCode = new Map<string, ResolvedCode>()
  const rejected: ResolveResult['rejected'] = []
  if (!list.length) return { byCode, rejected, failed: false }

  const docDigits = [refs.invoiceNo, refs.contractNo, refs.transportDoc].map(onlyDigits).filter((d) => d.length >= 6)
  const docLike = (c: string) => docDigits.includes(c)
  // Не 10 цифр или совпадает с номером документа — не спрашиваем.
  const ask: string[] = []
  for (const c of list) {
    if (!/^\d{10}$/.test(c)) rejected.push({ code: c, reason: 'notTenDigits' })
    else if (docLike(c)) rejected.push({ code: c, reason: 'docNumber' })
    else ask.push(c)
  }
  if (!ask.length) return { byCode, rejected, failed: false }

  try {
    const res = await tnvedApi.checkCodes(ask, { silent: true })
    const ok: string[] = []
    const bad: string[] = []
    for (const r of res.data) {
      const unit = okeiCode(r.unitCode)
      const dei: TnvedDei | null = unit ? { code: unit, name: r.unitName?.trim() || null, shortName: r.unitShortName?.trim() || null } : null
      byCode.set(r.code, { code: r.code, valid: r.valid, name: r.name?.trim() || null, dei })
      if (r.valid) {
        ok.push(r.code)
        seedDei(r.code, dei)
      } else {
        bad.push(r.code)
        rejected.push({ code: r.code, reason: 'notInDirectory' })
      }
    }
    seedTnvedCheck(ok, bad)
    return { byCode, rejected, failed: false }
  } catch (e) {
    console.error('Failed to check TNVED codes for import', e)
    return { byCode, rejected, failed: true }
  }
}
