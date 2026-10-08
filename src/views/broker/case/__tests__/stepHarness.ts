import { defineComponent, h, reactive, type Component } from 'vue'
import { vi } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import { casePerms, type CaseAuth } from '../casePermissions'
import { STEP_EXECUTOR, stepStateOf, stepSummary, type StepNo } from '../caseSteps'
import type { CaseStepContext, CaseStepMode } from '../caseContext'
import { useCaseActions } from '../useCaseActions'
import { caseDto } from './caseFixture'

// Обвязка для проверки панелей шагов: настоящие useCaseActions (замок действий) и casePerms, заявка и файлы — реактивное
// «серверное» состояние; reload берёт его заново, setCase заменяет заявку (как CaseView).
// Reka-подсказка заменена заглушкой — чтобы читать текст подсказки у выключенной кнопки.
export const TooltipStub = { props: ['title'], template: '<div data-tip :data-title="title"><slot /></div>' }
export const SelectStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: '<div data-select-stub><button v-for="o in options" :key="o.value" type="button" :data-option="o.value" @click="$emit(\'update:value\', o.value)">{{ o.label }}</button></div>',
}

export function mountStep(Step: Component, o: {
  user: CaseAuth
  step: StepNo
  mode?: CaseStepMode
  kase?: Partial<Import40CaseDto>
  files?: Import40FileDto[]
  readiness?: DeclarationReadiness[] | null
  plugins?: unknown[]
  stubs?: Record<string, unknown>
}) {
  const state = reactive({ kase: caseDto(o.kase), files: o.files ?? [], readiness: o.readiness ?? null }) as {
    kase: Import40CaseDto; files: Import40FileDto[]; readiness: DeclarationReadiness[] | null
  }
  const reload = vi.fn(async () => undefined)
  const harness = defineComponent({
    setup(_, { expose }) {
      const { actions, reasonKind } = useCaseActions(() => state.kase.id, reload)
      expose({ reasonKind, actions })
      return () => {
        const ctx: CaseStepContext = {
          kase: state.kase,
          files: state.files,
          invoices: [],
          readiness: state.readiness,
          perms: casePerms(o.user, state.kase),
          actions,
          setCase: (c) => { state.kase = c },
          step: {
            n: o.step,
            state: stepStateOf(state.kase.status, o.step),
            title: `step ${o.step}`,
            executor: STEP_EXECUTOR[o.step],
            executorLabel: STEP_EXECUTOR[o.step],
            summary: stepSummary(o.step, state.kase, state.files, (k) => k, 'ru'),
          },
        }
        return h(Step, { ctx, mode: o.mode ?? 'current' })
      }
    },
  })
  const w = mountWithI18n(harness, { attachTo: document.body, global: { plugins: o.plugins ?? [], stubs: { ZTooltip: TooltipStub, ZSelect: SelectStub, ...(o.stubs ?? {}) } } })
  return { w, state, reload }
}
