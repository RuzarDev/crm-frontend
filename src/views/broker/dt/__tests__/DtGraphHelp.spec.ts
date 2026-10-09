import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'

const refs = vi.hoisted(() => ({ getDtGuideGraph: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))

import DtGraphHelp from '../DtGraphHelp.vue'
import { resetDtGuideCache } from '../dtGuideCache'

let w: VueWrapper | undefined
afterEach(() => { w?.unmount(); w = undefined; document.body.innerHTML = '' })
beforeEach(() => {
  resetDtGuideCache()
  refs.getDtGuideGraph.mockReset()
  refs.getDtGuideGraph.mockImplementation(async (graph: string) => ({ graph, title: `Заголовок ${graph}`, html: `<p>Текст графы ${graph}</p><script>window.x=1</script>` }))
})

const mount = async (graph: string, asRole: 'declarant' | 'client' = 'declarant') => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = asRole === 'client' ? 'client' : 'employee'
  auth.businessRole = asRole
  auth.businessRoles = [asRole]
  auth.permissions = asRole === 'declarant' ? ['import40.read', 'import40.declarant'] : ['import40.read']
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/dt-guide', component: { template: '<div />' } }] })
  await router.push('/dt-guide')
  await router.isReady()
  return mountWithI18n(DtGraphHelp, { props: { graph }, global: { plugins: [pinia, router] }, attachTo: document.body })
}
const openIt = async (inst: VueWrapper) => {
  await inst.get('[data-dt-guide-trigger]').trigger('click')
  await flushPromises()
  await nextTick()
}
const body = () => document.body.querySelector('[data-dt-guide]') as HTMLElement | null

describe('DtGraphHelp — справка по графе (КТС 257)', () => {
  it('«?» открывает окно: заголовок графы, текст, ссылка на порядок заполнения ДТ', async () => {
    w = await mount('7')
    expect(w.get('[data-dt-guide-trigger]').attributes('aria-label')).toBe('Справка по графе 7')
    expect(body()).toBeNull()
    await openIt(w)
    expect(body()!.textContent).toContain('Графа 7 — Заголовок 7')
    expect(body()!.querySelector('[data-dt-guide-html]')!.textContent).toContain('Текст графы 7')
    expect(body()!.querySelector('script')).toBeNull()
    const link = body()!.querySelector('[data-dt-guide-link]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/dt-guide?graph=7')
    expect(link.textContent).toContain('графа 7')
  })

  it('справка грузится один раз на графу: повторное открытие и вторая подпись той же графы берут кэш', async () => {
    w = await mount('7')
    await openIt(w)
    await w.get('[data-dt-guide-trigger]').trigger('click') // закрыть
    await flushPromises()
    await openIt(w)
    expect(refs.getDtGuideGraph).toHaveBeenCalledTimes(1)
    w.unmount()
    w = await mount('7')
    await openIt(w)
    expect(refs.getDtGuideGraph).toHaveBeenCalledTimes(1)
    w.unmount()
    w = await mount('3')
    await openIt(w)
    expect(refs.getDtGuideGraph).toHaveBeenCalledTimes(2)
    expect(refs.getDtGuideGraph).toHaveBeenLastCalledWith('3')
  })

  it('не загрузилось — сообщение и «Повторить»; неудача не кэшируется', async () => {
    refs.getDtGuideGraph.mockRejectedValueOnce(new Error('net'))
    w = await mount('4')
    await openIt(w)
    expect(body()!.querySelector('[data-dt-guide-error]')!.textContent).toContain('Порядок заполнения для этой графы не найден')
    const retry = body()!.querySelector('[data-dt-guide-error] button') as HTMLButtonElement
    retry.click()
    await flushPromises()
    await nextTick()
    expect(body()!.querySelector('[data-dt-guide-error]')).toBeNull()
    expect(body()!.textContent).toContain('Текст графы 4')
    expect(refs.getDtGuideGraph).toHaveBeenCalledTimes(2)
  })

  it('ссылка на «Порядок заполнения ДТ» — только тем, кому открыт справочник (декларант)', async () => {
    w = await mount('5', 'client')
    await openIt(w)
    expect(body()!.textContent).toContain('Текст графы 5')
    expect(body()!.querySelector('[data-dt-guide-link]')).toBeNull()
  })
})
