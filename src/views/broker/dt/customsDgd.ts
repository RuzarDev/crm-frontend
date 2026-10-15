import type { ZOption } from '@/ui/options'

/**
 * Гр. 30 «Таможенный орган (местонахождение)»: КЕДЕН ждёт код уровня ДГД (департамент госдоходов), а декларант знает пост.
 * ДГД поста — из справочника постов КЕДЕН (parentCode, сервер /ref/customs-posts), список ДГД — /ref/customs-dgds.
 * Неизвестный пост — по виду кода (55302 → 55300), как и на сервере (KzCustomsDgd.Resolve).
 */
export interface CustomsDgd { code: string; name: string }

/** Опция поста из DtPage: value — код, parentCode/parentName — его ДГД (может не быть у старых записей). */
export type PostOption = ZOption & { parentCode?: string | null; parentName?: string | null }

/** Пункт списка органа: ДГД или пост; dgdLabel — подпись ДГД поста (по ней тоже ищем). */
export type OfficeOption = ZOption & { kind: 'dgd' | 'post'; dgdLabel?: string }

const patternLevel = (code: string): string => (/^\d{5}$/.test(code) ? `${code.slice(0, 3)}00` : code)

/** Код ДГД органа: сам ДГД — как есть, пост — его родитель из справочника, иначе — по виду кода. */
export const dgdOf = (code: string | null | undefined, posts: PostOption[], dgds: CustomsDgd[]): string => {
  const c = (code ?? '').trim()
  if (!c) return ''
  if (dgds.some((d) => d.code === c)) return c
  const parent = String(posts.find((p) => String(p.value) === c)?.parentCode ?? '').trim()
  return parent || patternLevel(c)
}

/** «50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ»; ДГД нет в списке — только код. */
export const dgdLabel = (code: string, posts: PostOption[], dgds: CustomsDgd[]): string => {
  const name = dgds.find((d) => d.code === code)?.name
    ?? posts.find((p) => String(p.parentCode ?? '') === code && p.parentName)?.parentName
  return name ? `${code} — ${name}` : code
}

/**
 * Список органа: каждый ДГД, за ним — его посты (поиск по коду и названию ДГД находит и сам ДГД, и его посты);
 * посты без известного ДГД — в конце. ДГД, известные только по постам, тоже попадают в список.
 */
export const officeOptions = (posts: PostOption[], dgds: CustomsDgd[]): OfficeOption[] => {
  const all = new Map<string, string>(dgds.map((d) => [d.code, d.name]))
  for (const p of posts) {
    const pc = String(p.parentCode ?? '').trim()
    if (pc && !all.has(pc)) all.set(pc, String(p.parentName ?? ''))
  }
  const out: OfficeOption[] = []
  const placed = new Set<string>()
  for (const [code, name] of [...all].sort(([a], [b]) => a.localeCompare(b))) {
    const label = name ? `${code} — ${name}` : code
    out.push({ value: code, label, kind: 'dgd' })
    for (const p of posts) {
      if (dgdOf(String(p.value), posts, dgds) !== code || all.has(String(p.value))) continue
      out.push({ ...p, kind: 'post', dgdLabel: label })
      placed.add(String(p.value))
    }
  }
  for (const p of posts) {
    if (!placed.has(String(p.value)) && !all.has(String(p.value))) out.push({ ...p, kind: 'post' })
  }
  return out
}

/** Поиск по подписи пункта и по подписи его ДГД: «мангист» находит ДГД и все его посты. */
export const officeFilter = (input: string, option: ZOption): boolean => {
  const q = input.toLocaleLowerCase('ru')
  return [option.label, (option as OfficeOption).dgdLabel ?? ''].some((s) => s.toLocaleLowerCase('ru').includes(q))
}

/** Пятизначный код таможенного органа РК (пост или ДГД) — для подсказки «перенести из номера СВХ». */
export const looksLikeCustomsCode = (value: string | null | undefined): boolean => /^\d{5}$/.test((value ?? '').trim())

/** Коды мест-складов (СВХ, таможенный склад): номер свидетельства обязателен, орган в XML не уходит. */
export const isWarehouseLocation = (code: string | null | undefined): boolean => ['11', '21'].includes((code ?? '').trim())
