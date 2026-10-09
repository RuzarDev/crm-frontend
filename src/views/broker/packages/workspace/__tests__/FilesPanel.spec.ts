import { afterEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentPackageDto } from '@/types/api'
import { file, pkg } from '../../partia/__tests__/packageFixture'
import { DropdownStub } from './harness'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import FilesPanel from '../FilesPanel.vue'

// Панель «Входящие файлы» сама по себе: счётчики, сегменты, подписи привязки, меню по правам, зона загрузки.
let w: VueWrapper
const mountPanel = (o: { pkg?: DocumentPackageDto; canLink?: boolean; canUpload?: boolean; canDelete?: boolean } = {}) => {
  w = mountWithI18n(FilesPanel, {
    props: {
      pkg: o.pkg ?? pkg(), canLink: o.canLink ?? true, canUpload: o.canUpload ?? true, canDelete: o.canDelete ?? true,
      uploading: false, isPending: () => false,
    },
    global: { stubs: { ZDropdown: DropdownStub } },
  })
}
const names = () => w.findAll('[data-ws-file-name]').map((n) => n.text())

afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

describe('FilesPanel', () => {
  it('счётчик, «не распределено: n» и сегменты со счётчиками', () => {
    mountPanel()
    expect(w.get('[data-ws-files-count]').text()).toBe('4')
    expect(w.get('[data-ws-files-free]').text()).toBe('не распределено: 1')
    const seg = w.get('[data-ws-files-filter]').text().replace(/\s+/g, ' ')
    expect(seg).toContain('Все 4')
    expect(seg).toContain('Свободные 1')
    expect(seg).toContain('Привязаны 3')
  })

  it('сегменты фильтруют список', async () => {
    mountPanel()
    expect(names()).toEqual(['free.pdf', 'rail.pdf', 'invoice.pdf', 'tsd.pdf'])
    await w.getComponent({ name: 'ZSegmented' }).vm.$emit('update:value', 'free')
    expect(names()).toEqual(['free.pdf'])
    await w.getComponent({ name: 'ZSegmented' }).vm.$emit('update:value', 'linked')
    expect(names()).toEqual(['rail.pdf', 'invoice.pdf', 'tsd.pdf'])
  })

  it('место привязки: номер контейнера моно-форматом, клиент партии, «не распределён»', () => {
    mountPanel()
    const targets = w.findAll('[data-ws-file-target]').map((t) => t.text())
    expect(targets[0]).toBe('не распределён')
    expect(targets[1]).toContain('MRSU 488584 9')
    expect(targets[2]).toContain('kazakhmys')
    expect(targets[3]).toContain('kazakhmys')
  })

  it('клиент партии — компанией, если известна; партия без клиента — «Клиент не выбран»', () => {
    w = mountWithI18n(FilesPanel, {
      props: {
        pkg: pkg(), canLink: true, canUpload: true, canDelete: true, uploading: false, isPending: () => false,
        clientLabel: (n: string) => (n === 'kazakhmys' ? 'ТОО «Казахмыс Трейд»' : n),
      },
      global: { stubs: { ZDropdown: DropdownStub } },
    })
    expect(w.findAll('[data-ws-file-target]')[2].text()).toContain('ТОО «Казахмыс Трейд»')
    w.unmount()
    const noClient = pkg()
    noClient.containers[0].consolidations[0].clientName = ''
    mountPanel({ pkg: noClient })
    expect(w.findAll('[data-ws-file-target]')[2].text()).toContain('Клиент не выбран')
  })

  it('пустой пакет и пустой сегмент — свои тексты', async () => {
    mountPanel({ pkg: pkg({ files: [] }) })
    expect(w.get('[data-ws-files-empty]').text()).toBe('Экспедитор ещё не загрузил файлы')
    w.unmount()
    mountPanel({ pkg: pkg({ files: [file({ id: 'x', containerId: 'c1' })] }) })
    await w.getComponent({ name: 'ZSegmented' }).vm.$emit('update:value', 'free')
    expect(w.get('[data-ws-files-empty]').text()).toBe('Все файлы распределены')
    expect(w.find('[data-ws-files-free]').exists()).toBe(false)
  })

  it('меню файла по правам; пункты передаются наверх', async () => {
    mountPanel()
    const row = w.findAll('[data-ws-file]')[0]
    expect(row.findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))).toEqual(['link', 'download', 'delete'])
    await row.get('[data-menu-item="link"]').trigger('click')
    await row.get('[data-menu-item="download"]').trigger('click')
    await row.get('[data-menu-item="delete"]').trigger('click')
    await row.get('[data-ws-file-preview]').trigger('click')
    expect(w.emitted('link')?.[0]?.[0]).toMatchObject({ id: 'f-free' })
    expect(w.emitted('download')?.[0]?.[0]).toMatchObject({ id: 'f-free' })
    expect(w.emitted('delete')?.[0]?.[0]).toMatchObject({ id: 'f-free' })
    expect(w.emitted('preview')?.[0]?.[0]).toMatchObject({ id: 'f-free' })
    w.unmount()
    mountPanel({ canLink: false, canDelete: false, canUpload: false })
    expect(w.findAll('[data-ws-file]')[0].findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))).toEqual(['download'])
    expect(w.find('[data-ws-upload]').exists()).toBe(false)
  })

  it('зона загрузки отклоняет чужой тип и файл больше 25 МБ до отправки', async () => {
    mountPanel()
    const input = w.get('input[type="file"]')
    const big = new File(['x'], 'scan.png')
    Object.defineProperty(big, 'size', { value: 25 * 1024 * 1024 + 1 })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['a'], 'ok.docx'), new File(['b'], 'old.xls'), big] })
    await input.trigger('change')
    expect(toast.error).toHaveBeenCalledTimes(2)
    expect((w.emitted('upload')?.[0]?.[0] as File[]).map((f) => f.name)).toEqual(['ok.docx'])
  })
})
