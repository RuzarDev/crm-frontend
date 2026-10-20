// Подпись ЭЦП через NCALayer (20.10.2026): программа НУЦ РК на компьютере пользователя, слушает wss://127.0.0.1:13579.
// Подписываем сами байты документа (.docx) — CMS с вложенными данными (attached), как при загрузке готового .cms:
// сервер сверяет содержимое с документом и проверяет подпись (NCANode). Модуль «basics» (NCALayer 1.4+); старый
// NCALayer без него — запасной вызов commonUtils.createCAdESFromBase64.

export const NCALAYER_URL = 'wss://127.0.0.1:13579/'

export type NcaLayerErrorKind = 'unavailable' | 'cancelled' | 'failed'

export class NcaLayerError extends Error {
  constructor(readonly kind: NcaLayerErrorKind, message: string = kind) {
    super(message)
    this.name = 'NcaLayerError'
  }
}

// Хранилища ключей: файл .p12 и токены/удостоверение личности.
const STORAGES = ['PKCS12', 'AKKaztokenStore', 'AKKZIDCardStore', 'AKEToken72KStore', 'AKEToken5110Store', 'AKJaCartaStore', 'AKAKEYStore']
// Ключ ПОДПИСИ (не аутентификации): у сертификатов НУЦ РК для подписи — «защищённая почта» в расширенном назначении.
const SIGN_EKU = '1.3.6.1.5.5.7.3.4'

type Reply = Record<string, unknown>

/** Ответ на запрос (а не приветствие {result:{version}}, которое NCALayer шлёт при подключении). */
const isReply = (m: Reply) => 'status' in m || 'code' in m || 'responseObject' in m || 'errorCode' in m

const basicsRequest = (base64: string) => ({
  module: 'kz.gov.pki.knca.basics',
  method: 'sign',
  args: {
    allowedStorages: STORAGES,
    format: 'cms',
    data: base64,
    signingParams: { decode: true, encapsulate: true, digested: false, tsaProfile: {} },
    signerParams: { extKeyUsageOids: [SIGN_EKU], chain: [] },
    locale: 'ru',
  },
})

const legacyRequest = (base64: string) => ({
  module: 'kz.gov.pki.knca.commonUtils',
  method: 'createCAdESFromBase64',
  args: ['PKCS12', 'SIGNATURE', base64, true],
})

/** Разбор ответа: CMS (base64) | 'retry-legacy' (нет модуля basics) | ошибка. */
export function parseReply(m: Reply): string | 'retry-legacy' {
  // basics: {status: true, body: {result: ['MII…']}}; отмена — status true без результата или status false с кодом.
  if ('status' in m) {
    const body = (m.body ?? {}) as { result?: unknown }
    const result = Array.isArray(body.result) ? body.result[0] : body.result
    if (m.status === true && typeof result === 'string' && result) return result
    if (m.status === true) throw new NcaLayerError('cancelled')
    const details = String((m as { details?: unknown }).details ?? m.code ?? '')
    if (/module|not\s*found|unknown/i.test(details) && !/cancel/i.test(details)) return 'retry-legacy'
    throw new NcaLayerError(/cancel|отмен/i.test(details) ? 'cancelled' as const : 'failed' as const, details || 'failed')
  }
  // commonUtils: {code: '200', responseObject: 'MII…'}; отмена — code 500 с message «action.canceled».
  const code = String(m.code ?? m.errorCode ?? '')
  if (code === '200' && typeof m.responseObject === 'string' && m.responseObject) return m.responseObject
  const msg = String(m.message ?? '')
  throw new NcaLayerError(/cancel/i.test(msg) ? 'cancelled' as const : 'failed' as const, msg || code || 'failed')
}

const send = (url: string, request: unknown, Ws: typeof WebSocket): Promise<Reply> =>
  new Promise((resolve, reject) => {
    let settled = false
    let ws: WebSocket
    try {
      ws = new Ws(url)
    } catch {
      reject(new NcaLayerError('unavailable'))
      return
    }
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      try { ws.close() } catch { /* уже закрыт */ }
      fn()
    }
    ws.onopen = () => ws.send(JSON.stringify(request))
    ws.onerror = () => done(() => reject(new NcaLayerError('unavailable')))
    ws.onclose = () => done(() => reject(new NcaLayerError('unavailable')))
    ws.onmessage = (ev: MessageEvent) => {
      let m: Reply
      try {
        m = JSON.parse(String(ev.data)) as Reply
      } catch {
        return
      }
      if (isReply(m)) done(() => resolve(m))
    }
  })

/**
 * Подписать данные (base64) ключом из NCALayer; возвращает CMS (base64) с вложенными данными.
 * Ошибки — NcaLayerError: unavailable (NCALayer не запущен/не установлен), cancelled (пользователь закрыл окно),
 * failed (прочее, текст NCALayer в message).
 */
export async function signWithNcaLayer(base64: string, opts: { url?: string; WebSocketImpl?: typeof WebSocket } = {}): Promise<string> {
  const url = opts.url ?? NCALAYER_URL
  const Ws = opts.WebSocketImpl ?? WebSocket
  const first = parseReply(await send(url, basicsRequest(base64), Ws))
  if (first !== 'retry-legacy') return first
  const second = parseReply(await send(url, legacyRequest(base64), Ws))
  if (second === 'retry-legacy') throw new NcaLayerError('failed')
  return second
}

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
