import type { Import40CaseDto, Import40DeclarationDto, Import40FileDto } from '@/api/import40'

// Полная заявка клиента для тестов карточки поставки: только поля, которые карточка читает.
export const caseDto = (o: Partial<Import40CaseDto> = {}): Import40CaseDto => ({
  id: 'c1', number: 'ИМ-2026-0166', cargo: 'Серверное оборудование', post: 'Нур-Жолы', status: 2,
  isProblem: false, problemNote: '', problemClientMessage: '', returnReason: '',
  svhInvoiceAmount: null, svhInvoiceNumber: '', svhInvoiceDate: null, svhInvoiceNote: '',
  cancelReason: '', cancelledAtUtc: null, createdAtUtc: '2026-09-24T09:00:00Z', updatedAtUtc: '2026-10-07T09:00:00Z',
  clientId: 'u1', clientName: 'ТОО «Ромашка»', assignedKppId: null, assignedDeclarantId: null,
  assignedKppName: null, assignedDeclarantName: null, vehicleNumber: '', driverName: '', driverPhone: '',
  powerOfAttorneyGenerated: false, powerOfAttorneyReturned: false, svhClosed: false, paymentConfirmed: false,
  transportMode: 1, wagonNumber: '', station: '', trailerNumber: '', flightNumber: '', airWaybill: '',
  vesselName: '', billOfLading: '', clientSenderName: 'Siemens AG', clientSenderCountryCode: '276',
  clientReceiverName: '', clientReceiverBin: '', clientReceiverCountryCode: '', clientCurrencyCode: 'EUR',
  clientEstimatedValue: 120000, containers: [], declarations: [], logs: [],
  ...o,
})

export const declaration = (o: Partial<Import40DeclarationDto> = {}): Import40DeclarationDto =>
  ({ id: 'd1', caseId: 'c1', declarationNumber: '50612/021025/0012345', isSplitReplaced: false, goodsItems: [], ...o }) as Import40DeclarationDto

export const fileDto = (o: Partial<Import40FileDto> = {}): Import40FileDto => ({
  id: 'f1', section: 'documents', originalFileName: 'invoice_DE-4471.pdf', contentType: 'application/pdf',
  sizeBytes: 120_000, uploadedByBusinessRole: 'client', createdAtUtc: '2026-09-24T09:10:00Z', docKind: null, ...o,
})
