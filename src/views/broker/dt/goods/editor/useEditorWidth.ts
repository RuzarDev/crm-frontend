import { computed, onBeforeUnmount, ref } from 'vue'
import {
  clampEditorWidth, EDITOR_DESKTOP_PX, editorWidthCss, editorWidthPx, isWideEditor, readEditorWidth, snapEditorWidth,
  toggleEditorWidth, writeEditorWidth, type EditorWidthPref,
} from './editorWidth'

// Ширина панели товара ДТ в редакторе (правила — editorWidth.ts): выбор пользователя, ширина окна (следим, пока панель
// открыта), перетаскивание края (окно — pointermove/pointerup, чтобы не терять мышь за пределами ручки) и ←/→ на ручке.
// Пока тянут — ширина в px «вживую», в хранилище пишется по отпусканию — и только если край сдвинули (щелчок по ручке
// без движения не перезаписывает сохранённую ширину нынешней, ужатой окном). Перетаскивание заканчивается и тогда, когда
// отпускание потерялось: окно потеряло фокус (⌘/Alt+Tab, системное окно) или мышь движется уже без нажатой кнопки.
/** Панель такой ширины и шире — в ней есть место для полосы списка товаров слева (GoodsEditorRail). */
export const RAIL_PANEL_MIN_PX = 1040
/** Сдвиг края меньше этого (px) — щелчок, а не перетаскивание: ширина не запоминается. */
export const EDITOR_DRAG_MIN_PX = 3

export function useEditorWidth() {
  const pref = ref<EditorWidthPref>(readEditorWidth())
  const viewport = ref(typeof window === 'undefined' ? EDITOR_DESKTOP_PX : window.innerWidth)
  const dragPx = ref<number | null>(null)

  const onResize = () => { viewport.value = window.innerWidth }
  let tracking = false
  /** Следить за шириной окна (пока панель открыта). */
  const track = (on: boolean) => {
    if (on) onResize()
    if (on === tracking) return
    tracking = on
    if (on) window.addEventListener('resize', onResize)
    else window.removeEventListener('resize', onResize)
  }

  const desktop = computed(() => viewport.value >= EDITOR_DESKTOP_PX)
  const px = computed(() => dragPx.value ?? editorWidthPx(pref.value, viewport.value))
  const css = computed(() => (dragPx.value != null ? `${dragPx.value}px` : editorWidthCss(pref.value)))
  const wide = computed(() => isWideEditor(dragPx.value ?? pref.value, viewport.value))
  const dragging = computed(() => dragPx.value != null)
  /** Место для полосы списка товаров: компьютер и панель не уже RAIL_PANEL_MIN_PX. */
  const rail = computed(() => desktop.value && px.value >= RAIL_PANEL_MIN_PX)

  const set = (p: EditorWidthPref) => {
    pref.value = p
    writeEditorWidth(p)
  }
  const toggle = () => set(toggleEditorWidth(pref.value, viewport.value))
  /** ←/→ на ручке: шире / уже на delta px. */
  const nudge = (delta: number) => set(snapEditorWidth(px.value + delta, viewport.value))

  // ---- Перетаскивание края ----
  let startX = 0
  let startW = 0
  /** Ширина в начале перетаскивания (в пределах окна) — с ней сравнивается итог: не сдвинули — не пишем. */
  let startPx = 0
  let bodyStyle: { cursor: string; userSelect: string } | null = null
  const onMove = (e: PointerEvent) => {
    // Основная кнопка уже не нажата — отпускание случилось вне страницы (потерялось): заканчиваем на том, что было.
    if ((e.buttons & 1) === 0) {
      onUp()
      return
    }
    // Панель справа: тянем край влево — шире.
    dragPx.value = clampEditorWidth(startW + (startX - e.clientX), viewport.value)
  }
  const stopListening = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('blur', onUp)
    if (bodyStyle) {
      document.body.style.cursor = bodyStyle.cursor
      document.body.style.userSelect = bodyStyle.userSelect
      bodyStyle = null
    }
  }
  function onUp() {
    stopListening()
    const w = dragPx.value
    dragPx.value = null
    if (w != null && Math.abs(w - startPx) >= EDITOR_DRAG_MIN_PX) set(snapEditorWidth(w, viewport.value))
  }
  /** Нажали на ручку края; current — ширина панели на экране (px), нет — расчётная. */
  const startDrag = (e: PointerEvent, current?: number) => {
    if (e.button !== 0 || !desktop.value || dragPx.value != null) return
    e.preventDefault()
    startX = e.clientX
    startW = current && current > 0 ? current : px.value
    startPx = clampEditorWidth(startW, viewport.value)
    dragPx.value = startPx
    // Пока тянут — курсор «изменить ширину» везде и без выделения текста страницы.
    bodyStyle = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
  }

  onBeforeUnmount(() => {
    stopListening()
    dragPx.value = null
    track(false)
  })

  return { pref, viewport, px, css, wide, desktop, dragging, rail, track, toggle, nudge, startDrag, set }
}
