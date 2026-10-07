import { computed, defineComponent, h, provide, type Component } from 'vue'
import { vi } from 'vitest'
import { zFieldKey, type ZFieldContext, type ZFieldControl } from '@/ui/form'
import { mountWithI18n } from './mountWithI18n'

/**
 * Z-поле внутри поддельного ZField: контекст отдаёт id 'f-1', ошибку 'f-1-msg', invalid и required,
 * записывает занявшие поле контролы и вызовы onChange/onBlur. Проверка связи поля без ZForm/ZField.
 */
export const mountInField = (
  component: Component,
  props: Record<string, unknown> = {},
  o: { attrs?: Record<string, unknown>; slots?: Record<string, () => unknown>; label?: boolean } = {},
) => {
  const claimed: ZFieldControl[] = []
  const ctx: ZFieldContext = {
    controlId: computed(() => 'f-1'),
    labelId: computed(() => (o.label === false ? undefined : 'f-1-label')),
    describedBy: computed(() => 'f-1-msg'),
    invalid: computed(() => true),
    required: computed(() => true),
    claim: (c) => {
      claimed.push(c)
      return { active: computed(() => claimed[0] === c), release: () => { claimed.splice(claimed.indexOf(c), 1) } }
    },
    onChange: vi.fn(),
    onBlur: vi.fn(),
  }
  const Host = defineComponent({
    setup() {
      provide(zFieldKey, ctx)
      return () => h(component, { ...props, ...o.attrs }, o.slots)
    },
  })
  const w = mountWithI18n(Host, { attachTo: document.body })
  return { w, ctx, claimed }
}
