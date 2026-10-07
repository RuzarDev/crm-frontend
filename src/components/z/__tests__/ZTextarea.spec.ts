import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ZTextarea from '../ZTextarea.vue'

describe('ZTextarea', () => {
  it('v-model:value и rows', async () => {
    const w = mount(ZTextarea, { props: { value: 'a', rows: 5 } })
    const ta = w.find('textarea')
    expect(ta.attributes('rows')).toBe('5')
    await ta.setValue('ab')
    expect(w.emitted('update:value')?.[0]).toEqual(['ab'])
  })
  it('invalid — aria-invalid', () => {
    expect(mount(ZTextarea, { props: { invalid: true } }).find('textarea').attributes('aria-invalid')).toBe('true')
  })
})
