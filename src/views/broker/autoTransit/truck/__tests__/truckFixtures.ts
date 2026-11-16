import type { Party, TruckCard, TruckEvent, TruckFile } from '@/api/autoTransit'

// Карточка машины для спек задачи 9.
export const party = (id: string, number: number, o: Partial<Party> = {}): Party => ({
  id, number, clientId: null, recipientName: `ТОО «Получатель ${number}»`, recipientRegNumber: '123456789012', recipientCountry: 'KZ',
  recipientEmail: '', recipientPhone: '', shipperName: 'Khorgos Trade', shipperCountry: 'CN', invoiceNumber: `KT-${number}`,
  invoiceDate: '2026-11-15', places: 420, grossKg: 8100, value: 38400, currency: 'USD', destinationCountry: 'KZ',
  destinationOfficeCode: '50509', submittedAtUtc: null, submittedBy: null, tdNumber: '', tdDate: null,
  importInterestAtUtc: null, importInterestContact: null, ...o,
})

export const file = (id: string, o: Partial<TruckFile> = {}): TruckFile => ({
  id, partyId: null, kind: 'other', stamped: false, visibleToRecipient: false, fileName: `${id}.jpg`, sizeBytes: 1000,
  uploadedBy: 'Бакдаулет', uploadedAtUtc: '2026-11-16T09:14:00Z', ...o,
})

export const event = (id: string, stage: number, atUtc: string, o: Partial<TruckEvent> = {}): TruckEvent => ({
  id, stage, partyId: null, action: 'done', by: 'Бакдаулет', atUtc, note: '', ...o,
})

export const card = (o: Partial<TruckCard> = {}): TruckCard => ({
  id: 't1', plate: 'A 318 KZ 19', trailerPlate: '02 BCA 19', driverName: 'Ван Лэй', title: 'ТОО «Получатель 1»',
  partiesCount: 1, placesTotal: 420, grossKgTotal: 8100, currentStage: 3, stageSinceUtc: '2026-11-16T09:45:00Z',
  status: 'inWork', problemNote: '', stalled: false, blockerCode: null, submittedCount: 0, tdNumberCount: 0,
  createdAtUtc: '2026-11-16T09:12:00Z', plateCountry: 'KZ', trailerCountry: 'KZ', driverDoc: '', carrierName: 'Khorgos Trans Ltd',
  carrierCountry: 'CN', carrierRegNumber: '', customsPostCode: '50509', arrivedAtUtc: '2026-11-16T09:12:00Z', stageNumber: '',
  parties: [party('p1', 1)],
  files: [file('f1', { kind: 'driverPassport' })],
  events: [event('e1', 1, '2026-11-16T09:14:00Z'), event('e2', 2, '2026-11-16T09:31:00Z')],
  blockers: [],
  can: { border: true, declare: false, manage: false },
  ...o,
})

/** Ошибка axios с ответом сервера. */
export const httpError = (status: number, data: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
