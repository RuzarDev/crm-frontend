import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampEditorWidth, EDITOR_MIN_PX, EDITOR_NARROW_PX, EDITOR_STRIP_PX, editorWidthCss, editorWidthKey, editorWidthPx, isWideEditor,
  maxEditorWidth, parseEditorWidth, readEditorWidth, snapEditorWidth, toggleEditorWidth, writeEditorWidth,
} from '../editor/editorWidth'

// Ширина панели товара ДТ (правка №17): «широко» 90% окна по умолчанию, «узко» 780 px, своя ширина перетаскиванием,
// выбор помнится у пользователя (localStorage, try/catch).
beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ширина панели товара: расчёт', () => {
  it('«широко» — 90% окна, «узко» — 780 px (не шире окна), своя — в пределах [560; окно − полоса]', () => {
    expect(editorWidthPx('wide', 1440)).toBe(1296)
    expect(editorWidthPx('wide', 1920)).toBe(1728)
    expect(editorWidthPx('narrow', 1440)).toBe(EDITOR_NARROW_PX)
    expect(editorWidthPx('narrow', 700)).toBe(700)
    expect(editorWidthPx(1000, 1440)).toBe(1000)
    expect(editorWidthPx(300, 1440)).toBe(EDITOR_MIN_PX)
    expect(editorWidthPx(5000, 1440)).toBe(1440 - EDITOR_STRIP_PX)
    expect(maxEditorWidth(1440)).toBe(1376)
    expect(maxEditorWidth(500)).toBe(EDITOR_MIN_PX)
    expect(clampEditorWidth(1000.4, 1440)).toBe(1000)
  })

  it('CSS-ширина: «широко» — 90vw (следует за окном), «узко» — 780px, своя — не шире окна минус полоса', () => {
    expect(editorWidthCss('wide')).toBe('90vw')
    expect(editorWidthCss('narrow')).toBe('780px')
    expect(editorWidthCss(1000)).toBe(`min(1000px, calc(100vw - ${EDITOR_STRIP_PX}px))`)
  })

  it('«Развернуть / Сузить»: широкая (и своя ближе к «широко») → «узко», иначе → «широко»', () => {
    expect(isWideEditor('wide', 1440)).toBe(true)
    expect(isWideEditor('narrow', 1440)).toBe(false)
    // Середина между 1296 и 780 — 1038.
    expect(isWideEditor(1100, 1440)).toBe(true)
    expect(isWideEditor(900, 1440)).toBe(false)
    expect(toggleEditorWidth('wide', 1440)).toBe('narrow')
    expect(toggleEditorWidth('narrow', 1440)).toBe('wide')
    expect(toggleEditorWidth(1100, 1440)).toBe('narrow')
    expect(toggleEditorWidth(900, 1440)).toBe('wide')
  })

  it('отпустили рядом с «широко» / «узко» — запоминаются они; иначе — своя ширина в пределах окна', () => {
    expect(snapEditorWidth(1290, 1440)).toBe('wide')
    expect(snapEditorWidth(790, 1440)).toBe('narrow')
    expect(snapEditorWidth(1000, 1440)).toBe(1000)
    expect(snapEditorWidth(100, 1440)).toBe(EDITOR_MIN_PX)
    expect(snapEditorWidth(9999, 1440)).toBe(1376)
  })
})

describe('ширина панели товара: запоминание у пользователя', () => {
  it('по умолчанию «широко»; запись и чтение — по ключу с id пользователя; другой пользователь — своё', () => {
    expect(readEditorWidth()).toBe('wide')
    localStorage.setItem('userId', 'u-1')
    expect(editorWidthKey()).toBe('zircon.dt.goodsEditorWidth:u-1')
    writeEditorWidth('narrow')
    expect(localStorage.getItem('zircon.dt.goodsEditorWidth:u-1')).toBe('narrow')
    expect(readEditorWidth()).toBe('narrow')
    writeEditorWidth(1012.6)
    expect(localStorage.getItem('zircon.dt.goodsEditorWidth:u-1')).toBe('1013')
    expect(readEditorWidth()).toBe(1013)
    localStorage.setItem('userId', 'u-2')
    expect(readEditorWidth()).toBe('wide')
    localStorage.removeItem('userId')
    expect(editorWidthKey()).toBe('zircon.dt.goodsEditorWidth')
  })

  it('испорченное значение — «широко»', () => {
    for (const raw of [null, '', 'abc', '12', '-900', '1e4', '400', 'NaN', ' wide']) expect(parseEditorWidth(raw), String(raw)).toBe('wide')
    expect(parseEditorWidth('narrow')).toBe('narrow')
    expect(parseEditorWidth('900')).toBe(900)
  })

  it('хранилище недоступно — «широко» без ошибок, запись молча не сохраняется', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    vi.stubGlobal('localStorage', broken)
    expect(readEditorWidth()).toBe('wide')
    expect(editorWidthKey()).toBe('zircon.dt.goodsEditorWidth')
    expect(() => writeEditorWidth('narrow')).not.toThrow()
    vi.stubGlobal('localStorage', undefined)
    expect(readEditorWidth()).toBe('wide')
    expect(() => writeEditorWidth(900)).not.toThrow()
  })
})
