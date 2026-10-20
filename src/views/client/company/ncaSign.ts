// Подпись договора/доверенности в Zircon через NCALayer (20.10.2026): скачать текущий .docx (тот же, что отдаёт
// «Скачать»), подписать в NCALayer (CMS с вложенными данными) и загрузить как подписанный файл — сервер сверяет содержимое
// и проверяет подпись (NCANode), как при ручной загрузке .cms.
import { import40ContractApi, type Import40DocumentDto } from '@/api/import40Contract'
import { NcaLayerError, base64ToBytes, blobToBase64, signWithNcaLayer } from '@/utils/ncalayer'

export async function signDocumentWithNcaLayer(
  clientId: string, doc: Import40DocumentDto, side: 'client' | 'provider', sign: typeof signWithNcaLayer = signWithNcaLayer,
): Promise<Import40DocumentDto> {
  const docx = await import40ContractApi.downloadDocument(clientId, doc.id)
  const cms = await sign(await blobToBase64(docx))
  const file = new File([base64ToBytes(cms)], `${doc.number}-${doc.year}-${side}.cms`, { type: 'application/pkcs7-signature' })
  return import40ContractApi.signDocument(clientId, doc.id, side, file, { silent: true, method: 'ncalayer' })
}

/** Текст ошибки NCALayer для пользователя; null — не ошибка NCALayer (ответ сервера разбирает вызывающий). */
export function ncaErrorText(e: unknown, t: (key: string, p?: Record<string, unknown>) => string): string | null {
  if (!(e instanceof NcaLayerError)) return null
  if (e.kind === 'failed') return t('ncalayer.failed', { msg: e.message })
  return t(`ncalayer.${e.kind}`)
}
