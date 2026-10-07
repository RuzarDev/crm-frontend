import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'

// Восьмигранник знака залит navy: на navy-фоне (inverse) без контура от знака остаётся только «звезда» граней.
describe('ZirconLogo', () => {
  it('inverse — белое слово и контур знака (drop-shadow по силуэту)', () => {
    const w = mount(ZirconLogo, { props: { inverse: true, size: 'md' } })
    const img = w.get('img')
    expect(img.attributes('alt')).toBe('')
    expect(img.classes().some((c) => c.startsWith('[filter:drop-shadow('))).toBe(true)
    expect(w.text()).toBe('ZIRCON')
    expect(w.find('.text-white').exists()).toBe(true)
  })
  it('обычный — без контура, слово navy', () => {
    const w = mount(ZirconLogo)
    expect(w.get('img').classes().some((c) => c.includes('filter'))).toBe(false)
    expect(w.find('.text-navy').exists()).toBe(true)
  })
})
