import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { pkg } from '../../partia/__tests__/packageFixture'
import { App, BROKER, as, dataTransfer, makeRouter, mockMedia, settle, stubs } from './harness'

const api = vi.hoisted(() => ({ getById: vi.fn(), linkFile: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/documentPackages', () => ({ documentPackagesApi: api }))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/ui/message', () => ({ message: toast }))

import WorkspacePage from '../WorkspacePage.vue'

// Перетаскивание файла на дерево: одна цель — один запрос (B13.1), подсветка одной цели, подсказка «Отпустите…».
let w: VueWrapper
let router: Router

const mountPage = async () => {
  await router.push('/document-packages/pkg1/workspace')
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router], stubs } })
  await settle()
}
const fileRow = (id: string) => w.get(`[data-ws-file][data-file-id="${id}"]`)
const partia = () => w.get('[data-ws-partia][data-partia-id="p1"]')
const containerCard = (id: string) => w.get(`[data-ws-container][data-container-id="${id}"]`)
const drag = async (id: string) => {
  await fileRow(id).trigger('dragstart', { dataTransfer: dataTransfer() })
}
const over = async (el: DOMWrapper<Element>) => {
  await el.trigger('dragenter', { dataTransfer: dataTransfer() })
  await el.trigger('dragover', { dataTransfer: dataTransfer() })
}
const drop = async (el: DOMWrapper<Element>) => {
  await el.trigger('drop', { dataTransfer: dataTransfer() })
  await settle()
}
const hints = () => w.findAll('[data-ws-drop-hint]').map((h) => h.text())

beforeEach(() => {
  setActivePinia(createPinia())
  mockMedia(false)
  router = makeRouter(WorkspacePage)
  api.getById.mockResolvedValue(pkg())
  api.linkFile.mockImplementation(async () => pkg())
  as('importer', BROKER)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('перетаскивание файла', () => {
  it('файл, брошенный на партию, привязывается один раз — к партии (баг: всплытие в контейнер)', async () => {
    await mountPage()
    await drag('f-free')
    await over(partia())
    await drop(partia())
    expect(api.linkFile).toHaveBeenCalledTimes(1)
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-free', { containerId: 'c1', clientConsolidationId: 'p1', documentType: null })
  })

  it('подсвечена одна цель — та, над которой файл, с подсказкой «Отпустите, чтобы привязать…»', async () => {
    await mountPage()
    await drag('f-free')
    await over(partia())
    expect(hints()).toEqual(['Отпустите, чтобы привязать «free.pdf» к партии'])
    expect(partia().classes()).toContain('border-zircon')
    expect(containerCard('c1').classes()).not.toContain('border-zircon')
    await over(containerCard('c2'))
    expect(hints()).toEqual(['Отпустите, чтобы привязать «free.pdf» к контейнеру'])
    expect(partia().classes()).not.toContain('border-zircon')
  })

  it('на контейнер — привязка к контейнеру; инвойс остаётся инвойсом', async () => {
    await mountPage()
    await drag('f-inv')
    await over(containerCard('c2'))
    await drop(containerCard('c2'))
    expect(api.linkFile).toHaveBeenCalledTimes(1)
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-inv', { containerId: 'c2', clientConsolidationId: null, documentType: 'invoice' })
  })

  it('на фон дерева — «не распределять»', async () => {
    await mountPage()
    await drag('f-rail')
    await over(w.get('[data-ws-tree]'))
    expect(hints()).toEqual(['Отпустите, чтобы оставить «rail.pdf» нераспределённым'])
    await drop(w.get('[data-ws-tree]'))
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-rail', { containerId: null, clientConsolidationId: null, documentType: null })
  })

  it('туда же, где файл уже лежит, — запроса нет', async () => {
    await mountPage()
    await drag('f-rail')
    await drop(containerCard('c1'))
    expect(api.linkFile).not.toHaveBeenCalled()
  })

  it('файл с компьютера (без перетаскивания строки) деревом не берётся', async () => {
    await mountPage()
    await over(partia())
    await drop(partia())
    expect(api.linkFile).not.toHaveBeenCalled()
    expect(hints()).toEqual([])
  })

  it('без reestr.write перетаскивания нет', async () => {
    as('expeditor', ['reestr.read'])
    await mountPage()
    expect(fileRow('f-free').attributes('draggable')).toBe('false')
    await drag('f-free')
    await over(partia())
    await drop(partia())
    expect(api.linkFile).not.toHaveBeenCalled()
  })

  it('на телефоне перетаскивание выключено — остаётся «Привязать к…»', async () => {
    mockMedia(true)
    await mountPage()
    expect(fileRow('f-free').attributes('draggable')).toBe('false')
    expect(fileRow('f-free').find('[data-ws-file-handle]').exists()).toBe(false)
    expect(fileRow('f-free').find('[data-menu-item="link"]').exists()).toBe(true)
    await drag('f-free')
    await drop(partia())
    expect(api.linkFile).not.toHaveBeenCalled()
  })
})
