// Открытый товар ДТ в адресе (волна 6б): `?s=goods&item=N`, N — номер товара с 1. Внутри открытый товар держится
// по стабильному ключу (keyOf), а не по номеру: удалили товар выше или переставили — адрес догоняет новый номер;
// удалили сам открытый товар — редактор закрывается. Номер вне списка — закрыто (и адрес очищается).
// Редактор (Task 3) берёт openIndex / openItem / closeItem / step отсюда.
import { computed, ref, watch, type ComputedRef } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import type { Import40GoodsItemInput } from '@/types/api'
import { keyOf } from './useDtGoods'

export const ITEM_QUERY = 'item'

const parseItem = (v: LocationQuery[string] | undefined): number | null => {
  const s = Array.isArray(v) ? v[0] : v
  if (typeof s !== 'string' || !/^\d+$/.test(s)) return null
  const n = Number(s)
  return n >= 1 ? n : null
}

export interface GoodsItemRoute {
  /** Позиция открытого товара (с 0); null — редактор закрыт. */
  openIndex: ComputedRef<number | null>
  /** Ключ открытого товара (keyOf). */
  openKey: ComputedRef<number | null>
  /** Открыть товар на позиции index (с 0). */
  openItem: (index: number) => Promise<void>
  closeItem: () => Promise<void>
  /** Соседний товар: delta −1 / +1; за краем — ничего. Возвращает, перешли ли. */
  step: (delta: number) => Promise<boolean>
}

export function useGoodsItemRoute(items: () => readonly Import40GoodsItemInput[]): GoodsItemRoute {
  const route = useRoute()
  const router = useRouter()
  const key = ref<number | null>(null)

  const withItem = (n: number | null): LocationQuery => {
    const { [ITEM_QUERY]: _drop, ...rest } = route.query
    return n == null ? rest : { ...rest, s: 'goods', [ITEM_QUERY]: String(n) }
  }
  const replace = async (n: number | null) => {
    if (route.query[ITEM_QUERY] === (n == null ? undefined : String(n))) return
    await router.replace({ query: withItem(n) })
  }

  // Адрес → ключ товара.
  watch(
    () => route.query[ITEM_QUERY],
    (v) => {
      const n = parseItem(v)
      const g = n != null ? items()[n - 1] : undefined
      key.value = g ? keyOf(g) : null
      if (v !== undefined && !g) void replace(null)
    },
    { immediate: true },
  )

  const openIndex = computed<number | null>(() => {
    if (key.value == null) return null
    const i = items().findIndex((g) => keyOf(g) === key.value)
    return i >= 0 ? i : null
  })

  // Ключ → адрес: товар сдвинулся — новый номер; товара больше нет — закрыть.
  watch(openIndex, (i) => {
    if (key.value == null) return
    if (i == null) {
      key.value = null
      void replace(null)
    } else void replace(i + 1)
  })

  const openItem = async (index: number) => {
    const g = items()[index]
    if (!g) return
    key.value = keyOf(g)
    await replace(index + 1)
  }
  const closeItem = async () => {
    key.value = null
    await replace(null)
  }
  const step = async (delta: number) => {
    const i = openIndex.value
    if (i == null) return false
    const next = i + delta
    if (next < 0 || next >= items().length) return false
    await openItem(next)
    return true
  }

  return { openIndex, openKey: computed(() => key.value), openItem, closeItem, step }
}
