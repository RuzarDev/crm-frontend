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

export type RejectReason = 'notTenDigits' | 'notInDirectory' | 'docNumber' | 'partialMany'

export interface ResolveResult {
  byCode: Map<string, ResolvedCode>
  rejected: { code: string; reason: RejectReason }[]
  /** Проверка не удалась (сеть, лимит): коды переносятся как есть, ДЕИ «неизвестна» — количество в строку гр. 31. */
  failed: boolean
  /** Неполный код документа (6–9 цифр) → единственный действующий 10-значный под ним (12.11.2026, авиа «90 1880»). */
  expanded: Map<string, string>
}

/** Неполный код: подсубпозиция ТС (6 знаков) и уже — ищем 10-значные под ним; 4 знака (товарная позиция) — слишком широко. */
const PARTIAL = /^\d{6,9}$/

/** 10-значные коды справочника, начинающиеся с prefix; не ответил — null. */
async function leavesUnder(prefix: string): Promise<string[] | null> {
  try {
    const res = await tnvedApi.search(prefix, true, 30, { silent: true })
    return [...new Set(res.data.map((n) => n.code).filter((c) => /^\d{10}$/.test(c) && c.startsWith(prefix)))]
  } catch {
    return null
  }
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
  const expanded = new Map<string, string>()
  if (!list.length) return { byCode, rejected, failed: false, expanded }

  const docDigits = [refs.invoiceNo, refs.contractNo, refs.transportDoc].map(onlyDigits).filter((d) => d.length >= 6)
  const docLike = (c: string) => docDigits.includes(c)
  // Не 10 цифр или совпадает с номером документа — не спрашиваем.
  const ask: string[] = []
  for (const c of list) {
    if (docLike(c)) rejected.push({ code: c, reason: 'docNumber' })
    else if (/^\d{10}$/.test(c)) ask.push(c)
    else if (PARTIAL.test(c)) {
      // неполный код: один подкод — проверяется как обычный и ставится с замечанием; несколько — подбирает декларант
      const leaves = await leavesUnder(c)
      if (leaves?.length === 1) {
        expanded.set(c, leaves[0])
        if (!ask.includes(leaves[0])) ask.push(leaves[0])
      } else rejected.push({ code: c, reason: leaves?.length ? 'partialMany' : 'notTenDigits' })
    } else rejected.push({ code: c, reason: 'notTenDigits' })
  }
  if (!ask.length) return { byCode, rejected, failed: false, expanded }

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
    // подкод неполного кода оказался недействующим — неполный код не дополняется
    for (const [partial, full] of [...expanded]) {
      if (byCode.get(full)?.valid) continue
      expanded.delete(partial)
      rejected.push({ code: partial, reason: 'notTenDigits' })
    }
    return { byCode, rejected, failed: false, expanded }
  } catch (e) {
    console.error('Failed to check TNVED codes for import', e)
    // нет связи: неполный код не дополняется (подкод не проверен) — переносится как отброшенный
    for (const partial of expanded.keys()) rejected.push({ code: partial, reason: 'notTenDigits' })
    expanded.clear()
    return { byCode, rejected, failed: true, expanded }
  }
}
