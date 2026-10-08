import type { Import40CaseDto, Import40CaseInvoiceDto, Import40FileDto } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import type { CasePerms } from './casePermissions'
import type { CaseActions } from './useCaseActions'
import type { StepExecutor, StepNo, StepState } from './caseSteps'

/**
 * Контракт панелей шагов карточки заявки (Tasks 3–5: steps/StepDraft, StepBorder, StepDeclaring, StepSvh,
 * StepSvhPayment, StepAqniet).
 *
 * Каждый шаг — компонент с двумя пропсами: `ctx: CaseStepContext` и `mode: CaseStepMode`.
 * - mode 'current' — шаг идёт сейчас. Компонент сам рисует оболочку `<CaseStepPanel :step="ctx.step">`
 *   (заголовок, «шаг N из 6», слоты meta / actions / default) и в ней — поля, файлы и кнопки шага.
 * - mode 'done' — шаг пройден, раскрыт в «Пройденных шагах». Только чтение, без оболочки и без кнопок
 *   правки: сводка, данные, файлы со скачиванием. Строку-заголовок (галочка, название, сводка) рисует CaseView.
 * Будущие шаги и отменённая заявка панелей не рисуют.
 *
 * Действия — только через ctx.actions:
 * - `run(action, { value, extra })` — POST actions/{action} с прежним телом, загрузка, тост успеха
 *   broker.case.done.*, перечитывание; вернёт true при успехе;
 * - `mutate(key, fn, { done })` — прочие запросы (PUT полей, контейнеры, файлы, ДТ) под тем же замком;
 * - `isPending(key)` / `busy()` — состояние кнопок; `reload()` — перечитать всё; `ask(kind)` — окно причины
 *   (например, 'return' — «Вернуть клиенту»). Подтверждения без полей — useConfirm (@/ui/confirm).
 * Права — ctx.perms (casePermissions.ts): can, actionDisabled, actionHint (+ hintText для подсказки), claimVisible…
 * «Взять в работу» и назначение — в правой колонке (CaseTeam), шаги их не дублируют.
 * Ответ PUT (правка полей черновика) — ctx.setCase(dto), без полного перечитывания.
 */
export type CaseStepMode = 'current' | 'done'

export interface CaseStepInfo {
  n: StepNo
  state: StepState
  /** Название (enum.step.sN). */
  title: string
  executor: StepExecutor
  /** Подпись исполнителя (enum.role.*). */
  executorLabel: string
  /** Сводка пройденного шага (caseSteps.stepSummary). */
  summary: string
}

export interface CaseStepContext {
  kase: Import40CaseDto
  files: Import40FileDto[]
  /** Счета AQNIET по заявке (ошибка загрузки — пустой список). */
  invoices: Import40CaseInvoiceDto[]
  /** Сводка готовности ДТ (keden-readiness-summary); null — недоступна этой роли или не загрузилась. */
  readiness: DeclarationReadiness[] | null
  perms: CasePerms
  actions: CaseActions
  /** Новая заявка из ответа PUT — без перечитывания. */
  setCase: (c: Import40CaseDto) => void
  step: CaseStepInfo
}

export interface CaseStepProps {
  ctx: CaseStepContext
  mode: CaseStepMode
}
