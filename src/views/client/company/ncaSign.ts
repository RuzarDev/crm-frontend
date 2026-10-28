// Подпись договора/доверенности в Zircon через NCALayer (20.10.2026): скачать текущий .docx (тот же, что отдаёт
// «Скачать»), подписать в NCALayer (CMS с вложенными данными) и загрузить как подписанный файл — сервер сверяет содержимое
// и проверяет подпись (NCANode), как при ручной загрузке .cms.
import { import40ContractApi, type Import40DocumentDto } from '@/api/import40Contract'
import { extractServerText } from '@/api/client'
import { NcaLayerError, blobToBase64, cmsToBytes, signWithNcaLayer } from '@/utils/ncalayer'

export async function signDocumentWithNcaLayer(
  clientId: string, doc: Import40DocumentDto, side: 'client' | 'provider', sign: typeof signWithNcaLayer = signWithNcaLayer,
): Promise<Import40DocumentDto> {
  const docx = await import40ContractApi.downloadDocument(clientId, doc.id)
  const cms = await sign(await blobToBase64(docx))
  const file = new File([cmsToBytes(cms)], `${doc.number}-${doc.year}-${side}.cms`, { type: 'application/pkcs7-signature' })
  return import40ContractApi.signDocument(clientId, doc.id, side, file, { silent: true, method: 'ncalayer' })
}

/** Текст ошибки NCALayer для пользователя; null — не ошибка NCALayer (ответ сервера разбирает вызывающий). */
export function ncaErrorText(e: unknown, t: (key: string, p?: Record<string, unknown>) => string): string | null {
  if (!(e instanceof NcaLayerError)) return null
  if (e.kind === 'failed') return t('ncalayer.failed', { msg: e.message })
  return t(`ncalayer.${e.kind}`)
}

/**
 * Текст ошибки подписи через NCALayer (29.10.2026): ошибка NCALayer → её текст; ответ сервера → его текст; иначе (сбой сети,
 * ошибка браузера) — общий текст и техническая причина в скобках, чтобы по скриншоту клиента было видно, что сломалось.
 */
export function ncaSignErrorText(e: unknown, t: (key: string, p?: Record<string, unknown>) => string, fallback: string): string {
  const nca = ncaErrorText(e, t)
  if (nca) return nca
  const server = extractServerText((e as { response?: { data?: unknown } })?.response?.data)
  if (server) return server
  console.error('[ncalayer] подпись не загружена', e)
  const err = e as { name?: string; message?: string; code?: string } | null
  const detail = [err?.code, err?.name, err?.message].filter((x) => typeof x === 'string' && x).join(': ')
  return detail ? `${fallback} (${detail.slice(0, 160)})` : fallback
}
