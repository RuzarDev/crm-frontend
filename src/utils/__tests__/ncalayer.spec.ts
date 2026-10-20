import { describe, expect, it } from 'vitest'
import { NcaLayerError, base64ToBytes, blobToBase64, parseReply, signWithNcaLayer } from '../ncalayer'

// Поддельный NCALayer: приветствие {result:{version}} при подключении, затем ответ по модулю запроса.
const fakeWs = (reply: (req: { module: string; args: unknown }) => unknown, opts: { fail?: boolean } = {}) => {
  const sent: { module: string; args: unknown }[] = []
  class Ws {
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: (() => void) | null = null
    constructor() {
      setTimeout(() => {
        if (opts.fail) { this.onerror?.(); return }
        this.onopen?.()
      })
    }
    send(data: string) {
      const req = JSON.parse(data)
      sent.push(req)
      setTimeout(() => {
        this.onmessage?.({ data: JSON.stringify({ result: { version: '1.4' } }) })
        this.onmessage?.({ data: JSON.stringify(reply(req)) })
      })
    }
    close() { /* */ }
  }
  return { Ws: Ws as unknown as typeof WebSocket, sent }
}

describe('ncalayer', () => {
  it('basics: подписывает base64 документа как CMS с вложенными данными', async () => {
    const { Ws, sent } = fakeWs(() => ({ status: true, body: { result: ['MIIcms'] } }))
    expect(await signWithNcaLayer('ZG9j', { WebSocketImpl: Ws })).toBe('MIIcms')
    expect(sent[0].module).toBe('kz.gov.pki.knca.basics')
    expect(sent[0].args).toMatchObject({ format: 'cms', data: 'ZG9j', signingParams: { decode: true, encapsulate: true } })
  })

  it('старый NCALayer без basics — запасной commonUtils', async () => {
    const { Ws, sent } = fakeWs((req) => req.module === 'kz.gov.pki.knca.basics'
      ? { status: false, code: '500', details: 'module kz.gov.pki.knca.basics not found' }
      : { code: '200', responseObject: 'MIIlegacy' })
    expect(await signWithNcaLayer('ZG9j', { WebSocketImpl: Ws })).toBe('MIIlegacy')
    expect(sent.map((s) => s.module)).toEqual(['kz.gov.pki.knca.basics', 'kz.gov.pki.knca.commonUtils'])
  })

  it('NCALayer не запущен — unavailable; отмена — cancelled', async () => {
    await expect(signWithNcaLayer('x', { WebSocketImpl: fakeWs(() => ({}), { fail: true }).Ws })).rejects.toMatchObject({ kind: 'unavailable' })
    expect(() => parseReply({ status: true, body: {} })).toThrow(NcaLayerError)
    expect(() => parseReply({ status: true, body: {} })).toThrow('cancelled')
    expect(() => parseReply({ code: '500', message: 'action.canceled' })).toThrow('action.canceled')
  })

  it('base64 туда и обратно', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    const b64 = await blobToBase64(new Blob([bytes]))
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes))
  })
})
