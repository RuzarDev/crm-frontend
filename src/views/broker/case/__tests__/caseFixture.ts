import type { Import40CaseDto, Import40DeclarationDto, Import40FileDto } from '@/api/import40'
import type { CaseAuth } from '../casePermissions'

// Заявка, файлы и пользователи для тестов карточки заявки сотрудника.
export const caseDto = (o: Partial<Import40CaseDto> = {}): Import40CaseDto => ({
  id: 'c1', number: 'ИМ-2026-0182', cargo: 'Ноутбуки и комплектующие', post: 'Хоргос — ЦТО', status: 2,
  isProblem: false, problemNote: '', problemClientMessage: '', returnReason: '',
  svhInvoiceAmount: null, svhInvoiceNumber: '', svhInvoiceDate: null, svhInvoiceNote: '',
  cancelReason: '', cancelledAtUtc: null, createdAtUtc: '2026-10-02T09:00:00Z', updatedAtUtc: '2026-10-07T09:00:00Z',
  clientId: 'cl1', clientName: 'ТОО «Казахмыс Трейд»', assignedKppId: null, assignedDeclarantId: null,
  assignedKppName: null, assignedDeclarantName: null, vehicleNumber: '777 KTA 02', driverName: '', driverPhone: '',
  powerOfAttorneyGenerated: false, powerOfAttorneyReturned: false, svhClosed: false, paymentConfirmed: false,
  transportMode: 1, wagonNumber: '', station: '', trailerNumber: '12 KZ 3456', flightNumber: '', airWaybill: '',
  vesselName: '', billOfLading: '', clientSenderName: 'Lenovo PC HK Ltd', clientSenderCountryCode: '',
  clientReceiverName: 'ТОО «Казахмыс Трейд»', clientReceiverBin: '160440012345', clientReceiverCountryCode: '', clientCurrencyCode: 'USD',
  clientEstimatedValue: 25000, containers: [], declarations: [], logs: [],
  ...o,
})

export const declaration = (o: Partial<Import40DeclarationDto> = {}): Import40DeclarationDto =>
  ({ id: 'd1', caseId: 'c1', declarationNumber: '', isSplitReplaced: false, goodsItems: [], ...o }) as Import40DeclarationDto

export const fileDto = (o: Partial<Import40FileDto> = {}): Import40FileDto => ({
  id: 'f1', section: 'documents', originalFileName: 'invoice.pdf', contentType: 'application/pdf',
  sizeBytes: 120_000, uploadedByBusinessRole: 'client', createdAtUtc: '2026-10-02T09:10:00Z', docKind: null, ...o,
})

// Пользователи по умолчанию матрицы прав (BE Auth/RolePermissions.cs).
const user = (o: Partial<CaseAuth>): CaseAuth => ({ role: 'broker', businessRole: null, businessRoles: [], permissions: [], userId: 'me', ...o })
export const USERS = {
  admin: user({ role: 'administrator' }),
  declarant: user({ businessRole: 'declarant', businessRoles: ['declarant'], permissions: ['import40.read', 'import40.declarant', 'import40.kpp', 'import40.export'] }),
  kpp: user({ businessRole: 'kpp', businessRoles: ['kpp'], permissions: ['import40.read', 'import40.kpp', 'finance.read'] }),
  rop: user({
    businessRole: 'rop', businessRoles: ['rop'],
    permissions: ['import40.read', 'import40.declarant', 'import40.kpp', 'import40.assign', 'import40.problem', 'import40.export', 'finance.read', 'finance.write', 'clients.read'],
  }),
  accountant: user({ businessRole: 'accountant', businessRoles: ['accountant'], permissions: ['import40.read', 'finance.read', 'finance.write'] }),
  // Продажи с отдельно выданным правом import40.problem.
  problemOnly: user({ businessRole: 'sales', businessRoles: ['sales'], permissions: ['import40.read', 'import40.problem'] }),
}
