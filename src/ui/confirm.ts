import { reactive } from 'vue'

export interface ConfirmOptions { title: string; content?: string; okText?: string; cancelText?: string; danger?: boolean }

// Одно глобальное подтверждение на приложение (ZConfirmHost в App.vue) — замена Modal.confirm.
export const confirmState = reactive({
  open: false,
  title: '',
  content: undefined as string | undefined,
  okText: undefined as string | undefined,
  cancelText: undefined as string | undefined,
  danger: false,
  resolve: (_ok: boolean) => {},
})

// Номер текущего вызова: resolve прошлого вызова (уже отменённого новым) не закрывает новое окно.
let current = 0

export const useConfirm = () => ({
  confirm: (o: ConfirmOptions): Promise<boolean> => {
    confirmState.resolve(false) // предыдущий незакрытый — отмена
    const id = ++current
    return new Promise<boolean>((done) => {
      // Все поля явно: тексты и danger прошлого вызова не должны перейти в этот.
      Object.assign(confirmState, {
        title: o.title,
        content: o.content,
        okText: o.okText,
        cancelText: o.cancelText,
        danger: !!o.danger,
        open: true,
      })
      confirmState.resolve = (ok: boolean) => {
        if (id !== current) return
        current++
        confirmState.open = false
        confirmState.resolve = () => {}
        done(ok)
      }
    })
  },
})
