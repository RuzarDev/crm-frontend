import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'

// Ширина текста по настоящим шрифтам приложения (только для тестов): IBM Plex Sans из @fontsource — те же файлы, что
// подключает main.ts. Разбирается WOFF 1.0 (таблицы сжаты zlib): cmap (формат 4) → глиф, hmtx → ширина знака.
// Кернинг не учитывается (он обычно сужает текст — оценка с запасом). Без сети: файлы из node_modules.
// jsdom не считает раскладку, а оценка «знаков × константа» в тесте проверяла бы саму себя (ревью №17).

interface Face {
  upm: number
  glyphs: Map<number, number>
  advance: (glyph: number) => number
}

// Корень проекта — рабочая папка vitest (как в importTemplate.spec); import.meta.url в среде jsdom — не file:.
const FILES = resolve(process.cwd(), 'node_modules/@fontsource/ibm-plex-sans/files')
/** Наборы знаков @fontsource: латиница, кириллица и расширенная кириллица (казахские Ә Ғ Қ Ң Ө Ү Һ). */
const SUBSETS = ['latin', 'cyrillic', 'cyrillic-ext'] as const

function parseWoff(path: string): Face {
  const b = readFileSync(path)
  if (b.toString('latin1', 0, 4) !== 'wOFF') throw new Error(`не WOFF 1.0: ${path}`)
  const tables: Record<string, Buffer> = {}
  const count = b.readUInt16BE(12)
  for (let i = 0; i < count; i++) {
    const o = 44 + i * 20
    const tag = b.toString('latin1', o, o + 4)
    const offset = b.readUInt32BE(o + 4)
    const compLength = b.readUInt32BE(o + 8)
    const origLength = b.readUInt32BE(o + 12)
    const raw = b.subarray(offset, offset + compLength)
    tables[tag] = compLength < origLength ? inflateSync(raw) : raw
  }
  const upm = tables.head.readUInt16BE(18)
  const hMetrics = tables.hhea.readUInt16BE(34)
  const hmtx = tables.hmtx
  const cmap = tables.cmap
  const glyphs = new Map<number, number>()
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const platform = cmap.readUInt16BE(4 + i * 8)
    const off = cmap.readUInt32BE(8 + i * 8)
    if (platform !== 3 || cmap.readUInt16BE(off) !== 4) continue
    const segX2 = cmap.readUInt16BE(off + 6)
    const ends = off + 14
    const starts = ends + segX2 + 2
    const deltas = starts + segX2
    const ranges = deltas + segX2
    for (let s = 0; s < segX2 / 2; s++) {
      const end = cmap.readUInt16BE(ends + s * 2)
      const start = cmap.readUInt16BE(starts + s * 2)
      const delta = cmap.readInt16BE(deltas + s * 2)
      const range = cmap.readUInt16BE(ranges + s * 2)
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g = range === 0 ? (c + delta) & 0xffff : cmap.readUInt16BE(ranges + s * 2 + range + (c - start) * 2)
        if (range !== 0 && g) g = (g + delta) & 0xffff
        if (g) glyphs.set(c, g)
      }
    }
  }
  return { upm, glyphs, advance: (g) => hmtx.readUInt16BE(Math.min(g, hMetrics - 1) * 4) }
}

const faces = new Map<number, Face[]>()
const facesOf = (weight: number): Face[] => {
  let f = faces.get(weight)
  if (!f) {
    f = SUBSETS.map((s) => parseWoff(resolve(FILES, `ibm-plex-sans-${s}-${weight}-normal.woff`)))
    faces.set(weight, f)
  }
  return f
}

/** Ширина строки в px: IBM Plex Sans такого начертания (400, 500…) и кегля. Знака нет в шрифте — ошибка теста. */
export function plexTextPx(text: string, sizePx: number, weight = 400): number {
  let em = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    const face = facesOf(weight).find((f) => f.glyphs.has(code))
    if (!face) throw new Error(`нет знака «${ch}» (U+${code.toString(16)}) в IBM Plex Sans ${weight}`)
    em += face.advance(face.glyphs.get(code)!) / face.upm
  }
  return em * sizePx
}
