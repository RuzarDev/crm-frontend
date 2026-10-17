import { nationalListsApi, type KzList } from '@/api/nationalLists'

// Перечни маркировки и МУЦ приходят одним ответом и не меняются до выкладки: один запрос на сессию на обе вкладки.
// Сбой не кэшируется — «Повторить» запросит снова.
let cached: Promise<KzList[]> | null = null

export function loadKzLists(): Promise<KzList[]> {
  if (!cached) cached = nationalListsApi.lists().catch((e) => { cached = null; throw e })
  return cached
}

/** Для тестов. */
export function clearKzListsCache(): void { cached = null }
