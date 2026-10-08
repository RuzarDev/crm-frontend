// Справочники страницы записи транзита и правила значений, которые хранит запись.
import { computed, inject, provide, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { referencesApi } from '@/api/references'
import { useClassifiersStore } from '@/stores/classifiers'
import type { RefCodeItem, RefForeignCustomsOfficeDto, RefItem } from '@/types/api'
import type { ZOption } from '@/ui/options'

/** Колонка ReestrEntry.DepartureCustomsOffice — 32 знака. */
export const DEPARTURE_OFFICE_MAX = 32

/** Код поста — ведущие 5–8 цифр названия: «57507 — ТАМОЖЕННЫЙ ПОСТ «…»» → «57507». */
export function customsPostCode(name: string | null | undefined): string | null {
  return /^\d{5,8}/.exec((name ?? '').trim())?.[0] ?? null
}

/**
 * Что сохранить в «Таможне отправления» при выборе поста (B.12): код поста; нет кода — название,
 * но название длиннее 32 знаков сервер не примет (tooLong — ошибка у поля).
 */
export function departureOfficeValue(name: string): { value: string; tooLong: boolean } {
  const code = customsPostCode(name)
  if (code) return { value: code, tooLong: false }
  return { value: name, tooLong: name.length > DEPARTURE_OFFICE_MAX }
}

/** Значение «Таможни отправления» без кода и длиннее 32 знаков — ошибка у поля. */
export function departureOfficeTooLong(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return v !== '' && !customsPostCode(v) && v.length > DEPARTURE_OFFICE_MAX
}

export type RefKind = 'posts' | 'stations' | 'countries' | 'foreignOffices' | 'okei'

export interface RecordRefs {
  /** Лениво грузит справочники: каждый — один раз на страницу (идущий запрос делят). Сбой — пустые варианты, не исключение. */
  ensure: (...kinds: RefKind[]) => Promise<void>
  /** Классификаторы ЕЭК через общий кэш сессии (useClassifiersStore). Сбой — пустые варианты. */
  ensureClassifiers: (codes: string[]) => Promise<void>
  classifierOptions: (code: string) => ZOption[]
  /** Пост — значение название (свободный ввод разрешён). */
  postOptions: ComputedRef<ZOption[]>
  /** Таможня отправления — значение код поста (departureOfficeValue), подпись — название. */
  departureOfficeOptions: ComputedRef<ZOption[]>
  /** Станция — значение название. */
  stationOptions: ComputedRef<ZOption[]>
  /** Страна — значение числовой код ОКСМ, подпись «398 — Казахстан». */
  countryOptions: ComputedRef<ZOption[]>
  /** Иностранная таможня — значение код. */
  foreignOfficeOptions: ComputedRef<ZOption[]>
  /** Единицы ОКЕИ — значение код, подпись «796 — шт». */
  okeiOptions: ComputedRef<ZOption[]>
  /** Краткое название единицы ОКЕИ по коду («796» → «шт»); нет в справочнике — null. */
  okeiName: (code: string | null | undefined) => string | null
}

export function createRecordRefs(): RecordRefs {
  const classifiers = useClassifiersStore()
  const posts = ref<RefItem[]>([])
  const stations = ref<RefItem[]>([])
  const countries = ref<RefCodeItem[]>([])
  const foreignOffices = ref<RefForeignCustomsOfficeDto[]>([])
  const okei = ref<RefCodeItem[]>([])

  const loaders: Record<RefKind, () => Promise<void>> = {
    posts: async () => { posts.value = await referencesApi.listCustomsPosts({ silent: true }) },
    stations: async () => { stations.value = await referencesApi.listStations({ silent: true }) },
    countries: async () => { countries.value = await referencesApi.listCountries({ silent: true }) },
    foreignOffices: async () => { foreignOffices.value = await referencesApi.listForeignCustomsOffices({ silent: true }) },
    okei: async () => { okei.value = await referencesApi.listOkeiUnits({ silent: true }) },
  }
  const pending = new Map<RefKind, Promise<void>>()

  const ensureOne = (kind: RefKind): Promise<void> => {
    const known = pending.get(kind)
    if (known) return known
    const run = loaders[kind]().catch((e) => {
      // Справочник — подсказка: поле остаётся свободным вводом. Неудачу не запоминаем — следующий раздел попробует снова.
      console.error(`Record refs: ${kind} failed`, e)
      pending.delete(kind)
    })
    pending.set(kind, run)
    return run
  }

  const active = <T extends { isActive: boolean }>(items: Ref<T[]>) => items.value.filter((i) => i.isActive !== false)
  const byName = (items: RefItem[]): ZOption[] => items.map((i) => ({ value: i.name, label: i.name }))
  const okeiNames = computed(() => new Map(okei.value.map((u) => [u.code, u.name])))

  return {
    ensure: async (...kinds) => { await Promise.all(kinds.map(ensureOne)) },
    ensureClassifiers: async (codes) => {
      try {
        await classifiers.loadMany(codes)
      } catch (e) {
        console.error('Record refs: classifiers failed', e)
      }
    },
    classifierOptions: (code) => classifiers.options(code),
    postOptions: computed(() => byName(active(posts))),
    departureOfficeOptions: computed(() => {
      const seen = new Set<string>()
      const out: ZOption[] = []
      for (const p of active(posts)) {
        const value = departureOfficeValue(p.name).value
        if (seen.has(value)) continue
        seen.add(value)
        out.push({ value, label: p.name })
      }
      return out
    }),
    stationOptions: computed(() => byName(active(stations))),
    countryOptions: computed(() => active(countries).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))),
    foreignOfficeOptions: computed(() => active(foreignOffices).map((o) => ({
      value: o.code,
      label: `${o.code} — ${o.name}${o.countryCode ? ` (${o.countryCode})` : ''}`,
    }))),
    okeiOptions: computed(() => active(okei).map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }))),
    okeiName: (code) => (code ? okeiNames.value.get(code) ?? null : null),
  }
}

const REFS_KEY: InjectionKey<RecordRefs> = Symbol('record-refs')

/** Страница записи зовёт один раз: разделы получат общий загрузчик (один запрос на справочник за страницу). */
export function provideRecordRefs(): RecordRefs {
  const refs = createRecordRefs()
  provide(REFS_KEY, refs)
  return refs
}

/** Загрузчик страницы; вне страницы (раздел сам по себе, тест) — собственный. */
export function useRecordRefs(): RecordRefs {
  return inject(REFS_KEY, null) ?? createRecordRefs()
}
