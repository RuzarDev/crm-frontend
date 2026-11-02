import apiClient from './client'

/** Статус ДТ для клиента (сервер: ClientDeclarationEndpoints.StatusOf). */
export type ClientDeclarationStatus = 'submitted' | 'released' | 'conditionalRelease' | 'refused' | 'withdrawn'

// «Мои декларации» клиента (02.11.2026, пакет K; бэк: GET /import40/client/declarations): ДТ всех его поставок,
// поданные в КЕДЕН, новые сверху. Бланк PDF — прежним import40Api.blankPdf(caseId, id).
export interface ClientDeclaration {
  id: string
  caseId: string
  caseNumber: string
  /** Регистрационный номер; пусто — ДТ подана, номер ещё не присвоен. */
  number: string
  /** Название ДТ, иначе первый товар, иначе груз поставки. */
  goods: string
  status: ClientDeclarationStatus
  /** Дата подачи (гр. А), иначе создания ДТ. */
  date: string
  releasedAtUtc: string | null
  /** Платежи в тенге: гр. В, иначе гр. 47; null — платежей в ДТ нет. */
  paymentsKzt: number | null
}

export const clientDeclarationsApi = {
  // silent — экран сам показывает ошибку с «Повторить», без тоста перехватчика.
  list: async (): Promise<ClientDeclaration[]> =>
    (await apiClient.get<ClientDeclaration[]>('/import40/client/declarations', { silent: true })).data,
}
