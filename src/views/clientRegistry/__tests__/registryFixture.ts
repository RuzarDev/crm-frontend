import type { RegistryDocument } from '@/api/clientRegistry'

export const regDoc = (o: Partial<RegistryDocument> = {}): RegistryDocument => ({
  id: 'r1', clientId: 'c1', clientName: null, category: 'certificate', title: null, number: 'KZ-1',
  issuedOn: '2026-01-10', validUntil: '2026-11-01', counterparty: null, tnvedCodes: null, note: null,
  status: 'expiring', daysLeft: 15, isArchived: false, archivedAtUtc: null, addedByClient: true,
  createdAtUtc: '2026-10-01T05:00:00Z', updatedAtUtc: '2026-10-01T05:00:00Z',
  files: [{ id: 'f1', fileName: 'cert.pdf', contentType: 'application/pdf', sizeBytes: 1000, createdAtUtc: '2026-10-01T05:00:00Z' }],
  ...o,
})
