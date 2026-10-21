import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ create: vi.fn(), clients: vi.fn(), posts: vi.fn(), success: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: { create: api.create, listClients: api.clients } }))
vi.mock('@/api/references', () => ({ referencesApi: { listCustomsPosts: api.posts } }))
vi.mock('@/ui/message', () => ({ message: { success: api.success, error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

import CreateRequestModal from '../CreateRequestModal.vue'

// Окно и выпадающий список — заглушки: здесь проверяется только состав запроса создания.
// Клик по заглушке списка выбирает первый вариант, правый клик — очищает (как «×» у allow-clear).
const ModalStub = {
  props: ['open', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open"><slot /><button data-ok type="button" :disabled="okButtonProps.disabled" @click="$emit(\'ok\')" /></div>',
}
const SelectStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: '<button type="button" @click="$emit(\'update:value\', options[0]?.value ?? null)" @contextmenu.prevent="$emit(\'update:value\', null)" />',
}

let w: VueWrapper
let router: Router
beforeEach(async () => {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/import-40')
  api.clients.mockResolvedValue([{ id: 'c1', username: 'alfa', companyName: 'ТОО Альфа' }])
  api.posts.mockResolvedValue([{ id: 'p1', name: 'Нур-Жолы', isActive: true }])
  api.create.mockResolvedValue({ id: 'new1' })
  w = mountWithI18n(CreateRequestModal, { props: { open: true }, global: { plugins: [router], stubs: { ZModal: ModalStub, ZSelect: SelectStub } } })
  await flushPromises()
})
afterEach(() => { w.unmount(); document.body.innerHTML = ''; vi.clearAllMocks() })

const fill = async (cargo: string) => {
  await w.get('[data-create-client]').trigger('click')
  await w.get('[data-create-cargo]').setValue(cargo)
}

describe('CreateRequestModal', () => {
  it('«Создать» недоступна без клиента и короткого груза; ошибка груза — по месту', async () => {
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
    await w.get('[data-create-client]').trigger('click')
    await w.get('[data-create-cargo]').setValue('к')
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Не короче 2 символов')
    await w.get('[data-create-cargo]').setValue('ки')
    expect(w.get('[data-ok]').attributes('disabled')).toBeUndefined()
    expect(w.text()).not.toContain('Не короче 2 символов')
  })

  it('пост выбран и очищен — уходит пустая строка, а не падение на trim', async () => {
    await fill('  ноутбуки ')
    await w.get('[data-create-post]').trigger('click')
    await w.get('[data-create-post]').trigger('contextmenu')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith({ clientId: 'c1', clientName: 'ТОО Альфа', cargo: 'ноутбуки', post: '' })
    expect(api.success).toHaveBeenCalledWith('Заявка создана')
    expect(router.currentRoute.value.path).toBe('/import-40/new1')
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('пост выбран — уходит его название', async () => {
    await fill('ткань')
    await w.get('[data-create-post]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith({ clientId: 'c1', clientName: 'ТОО Альфа', cargo: 'ткань', post: 'Нур-Жолы' })
  })

  it('сбой создания: окно остаётся, перехода нет', async () => {
    api.create.mockRejectedValueOnce(new Error('400'))
    await fill('ткань')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.success).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/import-40')
    expect(w.emitted('update:open')).toBeUndefined()
  })
})

// Правка №11 (21.10): поле «Пост / СВХ» с настоящим выпадающим списком — поиск по коду, полное имя в заявке.
describe('CreateRequestModal: поиск поста', () => {
  const mountReal = async () => {
    w.unmount()
    api.posts.mockResolvedValue([
      { id: 'p1', name: '57504 — ТАМОЖЕННЫЙ ПОСТ «ТЕМИРЖОЛ»', isActive: true, transportKind: 'RW', location: 'РЕСПУБЛИКА КАЗАХСТАН , ОБЛАСТЬ ЖЕТІСУ, АЛАКОЛЬСКИЙ Р-Н, СТ.ДОСТЫК' },
      { id: 'p2', name: '57505 — ТАМОЖЕННЫЙ ПОСТ «НҰР ЖОЛЫ»', isActive: true, transportKind: 'AUTO' },
    ])
    w = mountWithI18n(CreateRequestModal, { props: { open: true }, attachTo: document.body, global: { plugins: [router], stubs: { ZModal: ModalStub } } })
    await flushPromises()
  }
  const options = () => [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[]
  const search = async (sel: string, q: string | null) => {
    const input = w.get(`input${sel}`)
    await input.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    if (q !== null) {
      await input.setValue(q)
      await nextTick()
    }
  }

  it('«57505» — один пост; выбор уходит в заявку полным именем', async () => {
    await mountReal()
    expect(w.get('input[data-create-post]').attributes('placeholder')).toBe('Код или название поста')
    await search('[data-create-client]', null)
    options()[0].click()
    await nextTick()
    await w.get('[data-create-cargo]').setValue('ткань')
    await search('[data-create-post]', '57505')
    expect(options().map((o) => o.querySelector('[data-post-code]')?.textContent)).toEqual(['57505'])
    options()[0].click()
    await nextTick()
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith({ clientId: 'c1', clientName: 'ТОО Альфа', cargo: 'ткань', post: '57505 — ТАМОЖЕННЫЙ ПОСТ «НҰР ЖОЛЫ»' })
  })

  it('«нур жолы» и «достык» находят посты; пустой результат — «Пост не найден»', async () => {
    await mountReal()
    await search('[data-create-post]', 'нур жолы')
    expect(options().map((o) => o.querySelector('[data-post-code]')?.textContent)).toEqual(['57505'])
    await w.get('input[data-create-post]').setValue('достык')
    await nextTick()
    expect(options().map((o) => o.querySelector('[data-post-code]')?.textContent)).toEqual(['57504'])
    expect(options()[0].querySelector('[data-post-hint]')?.textContent).toBe('ж/д · ОБЛАСТЬ ЖЕТІСУ, АЛАКОЛЬСКИЙ Р-Н, СТ.ДОСТЫК')
    await w.get('input[data-create-post]').setValue('99999')
    await nextTick()
    expect(options()).toHaveLength(0)
    expect(document.body.textContent).toContain('Пост не найден — проверьте код (5 цифр) или название')
  })
})
