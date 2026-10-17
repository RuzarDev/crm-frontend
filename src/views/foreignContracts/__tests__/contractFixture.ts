import type { ForeignContract, ForeignContractCard } from '@/api/foreignContracts'

export const contract = (over: Partial<ForeignContract> = {}): ForeignContract => ({
  id: 'k1',
  clientId: 'c1',
  number: 'FC-1',
  contractDate: '2026-01-15',
  supplierName: 'Shenzhen Supplier',
  supplierCountryCode: '156',
  currency: 'USD',
  amount: 100000,
  validUntil: '2026-12-31',
  incoterms: 'FCA',
  incotermsPlace: 'Shenzhen',
  paymentTerms: '100% предоплата',
  unkNumber: '26010001/0001/1/1',
  unkDate: '2026-01-20',
  unkBank: 'АО Банк',
  unkRemovalDeadline: null,
  unkRemovedOn: null,
  repatriationDeadline: '2026-11-01',
  contractDocument: null,
  unkDocument: null,
  note: null,
  isArchived: false,
  createdAtUtc: '2026-01-15T00:00:00Z',
  updatedAtUtc: '2026-01-15T00:00:00Z',
  addedByClient: true,
  balance: { amount: 100000, delivered: 11000, inProgress: 20000, remaining: 89000, paid: 31100, paidNotDelivered: 20100, ratesApproximate: false, ratesMissing: false },
  deadlines: [
    { kind: 'repatriation', date: '2026-11-01', daysLeft: 15, state: 'soon' },
    { kind: 'end', date: '2026-12-31', daysLeft: 75, state: 'ok' },
  ],
  ...over,
})

export const card = (over: Partial<ForeignContractCard> = {}): ForeignContractCard => ({
  contract: contract(),
  shipments: [
    { caseId: 'case1', caseNumber: 'R-1', declarationId: 'd1', declarationNumber: '50101/101026/0000001', dtDate: '2026-09-10', released: true, releasedAtUtc: '2026-09-11T00:00:00Z', currency: 'EUR', invoiceValue: 10000, rate: 1.1, amountInContractCurrency: 11000, rateOfficial: true },
    { caseId: 'case2', caseNumber: 'R-2', declarationId: 'd2', declarationNumber: '', dtDate: '2026-10-01', released: false, releasedAtUtc: null, currency: 'USD', invoiceValue: 20000, rate: 1, amountInContractCurrency: 20000, rateOfficial: true },
  ],
  payments: [
    { id: 'p1', paidOn: '2026-09-05', amount: 30000, currency: 'USD', rate: 1, amountInContractCurrency: 30000, note: 'аванс', createdAtUtc: '2026-09-05T00:00:00Z', addedByClient: true },
    { id: 'p2', paidOn: '2026-09-05', amount: 1000, currency: 'EUR', rate: 1.1, amountInContractCurrency: 1100, note: null, createdAtUtc: '2026-09-05T00:00:00Z', addedByClient: true },
  ],
  reminders: [{ rule: 'contract-repatriation', deadline: '2026-11-01', threshold: 30, sentAtUtc: '2026-10-02T04:00:00Z' }],
  ...over,
})
