import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { import40Api, type Import40Action } from '@/api/import40'
import { message } from '@/ui/message'

/** Окна «причины» (CaseActionModals): проблема, шаг назад, отмена, возврат клиенту, завершение без счёта AQNIET. */
export type ReasonKind = 'problem' | 'stepBack' | 'cancel' | 'return' | 'completeWithoutInvoice'

export interface RunOptions {
  /** value тела действия (причина, заметка). */
  value?: string | null
  /** Прочие поля тела: сумма/номер/дата счёта СВХ, сообщение клиенту. */
  extra?: { amount?: number | null; number?: string | null; date?: string | null; clientMessage?: string | null }
  /** Ключ тоста успеха; по умолчанию broker.case.done.<действие>; false — без тоста. */
  done?: string | false
}

export interface MutateOptions {
  /** Ключ тоста успеха (i18n); по умолчанию — без тоста. */
  done?: string | false
  /** Перечитать заявку после успеха (по умолчанию да). */
  reload?: boolean
}

/**
 * API действий для шапки, баннеров, правой колонки и шагов (контракт шагов — caseContext.ts).
 * Методы, а не ref'ы: объект передаётся пропом, и шаблон шага читает состояние вызовом.
 */
export interface CaseActions {
  /** POST /import40/{id}/actions/{action} с прежним телом { value, ...extra }; тост успеха; перечитывание. true — успех. */
  run: (action: Import40Action, opts?: RunOptions) => Promise<boolean>
  /** Любая другая правка (PUT назначения, контейнеры, файлы, ДТ) с тем же замком и перечитыванием. */
  mutate: (key: string, fn: () => Promise<unknown>, opts?: MutateOptions) => Promise<boolean>
  /** Идёт ли действие с этим ключом (кнопка в загрузке). */
  isPending: (key: string) => boolean
  /** Идёт ли какое-либо действие (остальные кнопки не нажимаются, пока сервер не ответил). */
  busy: () => boolean
  /** Перечитать заявку, файлы, счета и готовность без скелетона. */
  reload: () => Promise<unknown>
  /** Открыть окно причины (возврат клиенту, проблема и т.д.). */
  ask: (kind: ReasonKind) => void
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
/** Ключ тоста успеха действия: broker.case.done.borderPassed и т.д. */
export const doneKey = (action: Import40Action): string => `broker.case.done.${camel(action)}`

/**
 * Действия карточки: одно действие за раз (повторное нажатие, пока идёт запрос, игнорируется),
 * ошибка — тост общего перехватчика (второй не добавляем), успех — тост «что произошло» и перечитывание.
 */
export function useCaseActions(caseId: () => string | null, reload: () => Promise<unknown>) {
  const { t } = useI18n()
  const pending = ref<string | null>(null)
  const reasonKind = ref<ReasonKind | null>(null)

  const mutate: CaseActions['mutate'] = async (key, fn, opts = {}) => {
    if (pending.value !== null) return false
    pending.value = key
    try {
      try {
        await fn()
      } catch {
        return false // текст ошибки уже показал перехватчик (api/client.ts)
      }
      if (opts.done) message.success(t(opts.done))
      if (opts.reload !== false) await reload()
      return true
    } finally {
      pending.value = null
    }
  }

  const run: CaseActions['run'] = async (action, opts = {}) => {
    const id = caseId()
    if (!id) return false
    return mutate(action, () => import40Api.action(id, action, opts.value ?? undefined, opts.extra), {
      done: opts.done === undefined ? doneKey(action) : opts.done,
    })
  }

  const actions: CaseActions = {
    run,
    mutate,
    isPending: (key) => pending.value === key,
    busy: () => pending.value !== null,
    reload,
    ask: (kind) => { reasonKind.value = kind },
  }
  return { actions, reasonKind, pending }
}
