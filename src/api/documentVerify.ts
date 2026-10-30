import apiClient from './client'

// Проверка подписей документа по QR (20.10.2026) — публичная, без входа.
export interface VerifySignature {
  side: 'client' | 'provider'
  method: string
  signerName: string | null
  signerIin: string | null
  signerBin: string | null
  organization: string | null
  certSerial: string | null
  certValidFromUtc: string | null
  certValidToUtc: string | null
  signedAtUtc: string | null
  verified: boolean
}

export interface VerifyDocument {
  kind: 'contract' | 'poa'
  number: string
  generatedAtUtc: string
  // consumed — разовый документ израсходован выполненной поставкой (C-20, 30.10.2026).
  status: 'active' | 'awaiting' | 'expired' | 'revoked' | 'consumed'
  validUntilUtc: string | null
  revokedAtUtc: string | null
  clientName: string
  clientBin: string | null
  providerName: string
  providerBin: string | null
  signatures: VerifySignature[]
}

export const documentVerifyApi = {
  get: async (token: string): Promise<VerifyDocument> =>
    (await apiClient.get<VerifyDocument>(`/verify/${encodeURIComponent(token)}`, { silent: true })).data,
}
