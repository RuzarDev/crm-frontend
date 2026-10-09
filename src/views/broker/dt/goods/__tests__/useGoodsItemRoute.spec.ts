import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { Import40GoodsItemInput } from '@/types/api'
import { useGoodsItemRoute, type GoodsItemRoute } from '../useGoodsItemRoute'

let w: VueWrapper | undefined
afterEach(() => w?.unmount())

const settle = async () => {
  await flushPromises()
  await nextTick()
}

// Хост — вне RouterView: живёт и тогда, когда адрес уже не страницы ДТ (как DtPage до своего размонтирования).
const setup = async (path: string) => {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: { render: () => null } },
      { path: '/system-data', name: 'system-data', component: { render: () => null } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const items = reactive([{ description: 'A' }, { description: 'B' }] as Import40GoodsItemInput[])
  let api!: GoodsItemRoute
  w = mount(defineComponent({ setup() { api = useGoodsItemRoute(() => items); return () => h('div') } }), { global: { plugins: [router] } })
  await settle()
  return { router, api }
}

describe('useGoodsItemRoute: только на маршруте страницы ДТ', () => {
  it('на странице ДТ ?item=N открывает товар; номер вне списка убирается из адреса', async () => {
    const { router, api } = await setup('/import-40/c1/dt/d1?s=goods&item=2')
    expect(api.openIndex.value).toBe(1)
    await router.push('/import-40/c1/dt/d1?s=goods&item=9')
    await settle()
    expect(api.openIndex.value).toBeNull()
    expect(router.currentRoute.value.query).toEqual({ s: 'goods' })
  })

  it('чужая страница со своим ?item: адрес не трогается, открытый товар не меняется', async () => {
    const { router, api } = await setup('/import-40/c1/dt/d1?s=goods&item=1')
    expect(api.openIndex.value).toBe(0)
    await router.push('/system-data?item=99')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/system-data?item=99')
    expect(api.openIndex.value).toBe(0)
    await api.closeItem()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/system-data?item=99')
  })
})
