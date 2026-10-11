import type { DtsGoodsColumn, DtsParty, DtsSheet, DtsView } from '@/api/dts'

const party = (name: string, bin: string | null = null): DtsParty => ({
  name, bin, region: null, city: 'АЛМАТЫ', street: 'АБАЯ', house: '1', apt: null, countryName: 'КАЗАХСТАН',
})

/** Товар добавочного листа ДТС (ответ сервера). */
export const dtsGoods = (number: number, over: Partial<DtsGoodsColumn> = {}): DtsGoodsColumn => ({
  number,
  tnvedCode: '7318150000',
  invoiceCurrency: 'USD',
  invoicePrice: 1500.5,
  invoiceRate: 495.12,
  invoicePriceKzt: 742927.56,
  box12: 742927.56,
  additions: { '13a': 120.5, '17': 5000 },
  box20: 5120.5,
  deductions: { '21': 100 },
  box24: 100,
  box25Kzt: 747948.06,
  box25Usd: 1510.64,
  declaredCustomsValueKzt: 747948.06,
  currencyLines: [{ goodsNumber: number, box: '17', currency: 'EUR', amount: 9.25, rate: 541.3 }],
  ...over,
})

export const dtsSheet = (over: Partial<DtsSheet> = {}): DtsSheet => ({
  formCode: 1,
  methodCode: '1',
  baseMethodCode: null,
  referenceDocumentId: 'ИМ-1/1',
  registrationNumber: '55302/051026/0000123',
  seller: party('SHENZHEN BRIGHT ELECTRONICS CO., LTD'),
  buyer: party('ТОО «КАЗАХМЫС ТРЕЙД»', '123456789012'),
  declarant: party('ТОО «КАЗАХМЫС ТРЕЙД»', '123456789012'),
  incotermsCode: 'CIF',
  incotermsPlace: 'ALMATY',
  invoices: [{ kindCode: '04021', name: 'Инвойс', number: 'INV-2026-0912', date: '2026-09-12' }],
  contracts: [{ kindCode: '03011', name: 'Контракт', number: 'SB-KZ-2026/04', date: null }],
  box6Docs: [],
  relation: false,
  relationPriceInfluence: false,
  relationApproxValue: false,
  restriction: false,
  valueCondition: false,
  royaltyContract: false,
  royaltyFee: false,
  subsequentResale: false,
  methodReason: null,
  placeName: 'АЛМАТЫ',
  addSheets: 0,
  box10b: '05.10.2026, ИВАНОВ И.И.',
  usdRate: 495.12,
  goods: [dtsGoods(1)],
  documentDate: '2026-10-05',
  expenseCurrenciesWithoutRate: [],
  box4Docs: [],
  evidence: [],
  dtValuationMethods: ['1'],
  signatory: { signedDate: '2026-10-05', fullName: 'ИВАНОВ И.И.', docKindCode: null, docNumber: null, docIssueDate: null, docCountry: null },
  ...over,
})

/** Ответ GET …/dts: пункт ДТ (гр. 8) и пункт самой ДТС. */
export const dtsView = (over: Partial<DtsView> = {}): DtsView => ({
  sheet: dtsSheet(),
  missing: ['Гр.8, получатель: дом длиннее 20 знаков', 'ДТС: не указано место для гр.17 (раздел «ДТС»)'],
  mismatchGoods: [],
  items: [
    { text: 'Гр.8, получатель: дом длиннее 20 знаков', graph: '8', goodsIndex: null },
    { text: 'ДТС: не указано место для гр.17 (раздел «ДТС»)', graph: 'ДТС', goodsIndex: null },
  ],
  ...over,
})
