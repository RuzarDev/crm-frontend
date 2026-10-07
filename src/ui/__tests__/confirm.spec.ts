import { describe, expect, it } from 'vitest'
import { confirmState, useConfirm } from '../confirm'

describe('useConfirm', () => {
  it('открывает состояние и резолвит true/false', async () => {
    const { confirm } = useConfirm()
    const p = confirm({ title: 'Подать ДТ?', danger: false })
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Подать ДТ?')
    confirmState.resolve(true)
    await expect(p).resolves.toBe(true)
    expect(confirmState.open).toBe(false)
  })
  it('новый вызов отменяет предыдущий (false)', async () => {
    const { confirm } = useConfirm()
    const first = confirm({ title: 'A' })
    const second = confirm({ title: 'B' })
    await expect(first).resolves.toBe(false)
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('B')
    confirmState.resolve(false)
    await expect(second).resolves.toBe(false)
  })
  it('тексты и danger прошлого вызова не переходят в следующий', async () => {
    const { confirm } = useConfirm()
    const first = confirm({ title: 'A', content: 'Текст', okText: 'Удалить', cancelText: 'Оставить', danger: true })
    confirmState.resolve(true)
    await first
    const second = confirm({ title: 'B' })
    expect(confirmState.content).toBeUndefined()
    expect(confirmState.okText).toBeUndefined()
    expect(confirmState.cancelText).toBeUndefined()
    expect(confirmState.danger).toBe(false)
    confirmState.resolve(false)
    await second
  })
  it('повторный resolve после закрытия ничего не делает', async () => {
    const { confirm } = useConfirm()
    const p = confirm({ title: 'A' })
    const resolve = confirmState.resolve
    resolve(true)
    resolve(false)
    await expect(p).resolves.toBe(true)
  })
  it('устаревший resolve не закрывает новое подтверждение', async () => {
    const { confirm } = useConfirm()
    const first = confirm({ title: 'A' })
    const stale = confirmState.resolve
    const second = confirm({ title: 'B' })
    await expect(first).resolves.toBe(false)
    stale(true)
    expect(confirmState.open).toBe(true)
    confirmState.resolve(true)
    await expect(second).resolves.toBe(true)
  })
})
