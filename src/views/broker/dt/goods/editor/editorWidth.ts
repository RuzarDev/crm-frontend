// Ширина панели товара ДТ (правка №17, 21.10.2026). Было ~780 px — таблица гр. 31 и вкладки не помещались.
//   «Широко» (по умолчанию) — 90% окна: слева видна полоса страницы, а в самой панели — полоса списка товаров
//   (GoodsEditorRail), чтобы было видно, какой товар открыт.
//   «Узко» — прежние 780 px.
//   Своя ширина — край панели тянется мышью (и ←/→ с клавиатуры): от EDITOR_MIN_PX до «окно минус полоса EDITOR_STRIP_PX».
//   Отпустили рядом с «широко» / «узко» (EDITOR_SNAP_PX) — запоминается как они: «широко» потом следует за окном.
// Выбор помнится у пользователя (localStorage, ключ с id пользователя — как вид строк гр. 31, charsMode.ts). Хранилище
// недоступно (приватный режим, запрет) или значение испорчено — «широко», без ошибок.
// Телефон и планшет (< EDITOR_DESKTOP_PX) — панель во всю ширину (класс max-lg:w-screen у панели), ширина не применяется.
export type EditorWidthPref = 'wide' | 'narrow' | number

export const EDITOR_WIDE_RATIO = 0.9
export const EDITOR_NARROW_PX = 780
export const EDITOR_MIN_PX = 560
/** Полоса страницы слева, которая остаётся видна при растягивании до упора. */
export const EDITOR_STRIP_PX = 64
/** С этой ширины окна (lg) панель — сбоку; уже — во всю ширину. */
export const EDITOR_DESKTOP_PX = 1024
/** Отпустили ближе этого к «широко» / «узко» — запоминается как они. */
export const EDITOR_SNAP_PX = 24
/** Шаг ←/→ на ручке края. */
export const EDITOR_NUDGE_PX = 48

const PREFIX = 'zircon.dt.goodsEditorWidth'

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Ключ пользователя: id из входа (stores/auth хранит его в localStorage «userId»); без входа — общий. */
export function editorWidthKey(): string {
  try {
    const user = storage()?.getItem('userId')
    return user ? `${PREFIX}:${user}` : PREFIX
  } catch {
    return PREFIX
  }
}

/** Сохранённое значение → выбор: «wide» / «narrow» / число px (не меньше EDITOR_MIN_PX); иначе — «широко». */
export function parseEditorWidth(raw: string | null | undefined): EditorWidthPref {
  if (raw === 'wide' || raw === 'narrow') return raw
  if (raw == null || !/^\d{3,5}$/.test(raw.trim())) return 'wide'
  const n = Number(raw)
  return n >= EDITOR_MIN_PX ? n : 'wide'
}

export function readEditorWidth(): EditorWidthPref {
  try {
    return parseEditorWidth(storage()?.getItem(editorWidthKey()))
  } catch {
    return 'wide'
  }
}

export function writeEditorWidth(pref: EditorWidthPref): void {
  try {
    storage()?.setItem(editorWidthKey(), String(typeof pref === 'number' ? Math.round(pref) : pref))
  } catch {
    /* хранилище недоступно — выбор живёт до перезагрузки */
  }
}

/** Самая широкая панель при этом окне: слева остаётся полоса страницы. */
export const maxEditorWidth = (viewport: number): number => Math.max(EDITOR_MIN_PX, Math.round(viewport) - EDITOR_STRIP_PX)

export const clampEditorWidth = (px: number, viewport: number): number =>
  Math.round(Math.min(Math.max(px, EDITOR_MIN_PX), maxEditorWidth(viewport)))

/** Ширина панели в px при этом окне. */
export function editorWidthPx(pref: EditorWidthPref, viewport: number): number {
  if (pref === 'wide') return Math.round(viewport * EDITOR_WIDE_RATIO)
  if (pref === 'narrow') return Math.min(EDITOR_NARROW_PX, Math.round(viewport))
  return clampEditorWidth(pref, viewport)
}

/** Панель «широкая» (кнопка в шапке предлагает сузить): «широко» или своя ширина ближе к нему, чем к «узко». */
export function isWideEditor(pref: EditorWidthPref, viewport: number): boolean {
  if (pref === 'wide') return true
  if (pref === 'narrow') return false
  const mid = (editorWidthPx('wide', viewport) + editorWidthPx('narrow', viewport)) / 2
  return editorWidthPx(pref, viewport) > mid
}

/** Кнопка «Развернуть / Сузить»: широкая — в «узко», иначе — в «широко». */
export const toggleEditorWidth = (pref: EditorWidthPref, viewport: number): EditorWidthPref =>
  (isWideEditor(pref, viewport) ? 'narrow' : 'wide')

/** Ширина после перетаскивания (или ←/→): в пределах окна; рядом с «широко» / «узко» — они. */
export function snapEditorWidth(px: number, viewport: number): EditorWidthPref {
  const w = clampEditorWidth(px, viewport)
  if (Math.abs(w - editorWidthPx('wide', viewport)) <= EDITOR_SNAP_PX) return 'wide'
  if (Math.abs(w - editorWidthPx('narrow', viewport)) <= EDITOR_SNAP_PX) return 'narrow'
  return w
}

/**
 * Ширина для панели (CSS, переменная --w у ZDrawer): «широко» — доля окна (следует за окном без пересчёта), «узко» —
 * 780 px, своя — не шире окна минус полоса страницы.
 */
export function editorWidthCss(pref: EditorWidthPref): string {
  if (pref === 'wide') return `${Math.round(EDITOR_WIDE_RATIO * 100)}vw`
  if (pref === 'narrow') return `${EDITOR_NARROW_PX}px`
  return `min(${Math.round(pref)}px, calc(100vw - ${EDITOR_STRIP_PX}px))`
}
