import { defineComponent, watch } from 'vue'
import { injectDialogRootContext } from 'reka-ui'

/**
 * Ставится внутрь DialogRoot (ZModal, ZDrawer): при каждом открытии запоминает, откуда открыли, — туда Reka
 * вернёт фокус после закрытия. Сама Reka запоминает это только при монтировании содержимого, а без
 * destroyOnClose оно живёт между открытиями: открыли другой кнопкой — фокус вернулся бы к первой.
 */
export const DialogOpenerSync = defineComponent({
  name: 'DialogOpenerSync',
  setup() {
    const root = injectDialogRootContext()
    watch(root.open, (open) => {
      if (!open) return
      const el = document.activeElement
      if (el instanceof HTMLElement && el !== document.body) root.triggerElement.value = el
    }, { flush: 'sync', immediate: true })
    return () => null
  },
})
