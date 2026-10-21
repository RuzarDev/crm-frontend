import { describe, expect, it } from 'vitest'
import type { CustomsPostItem } from '@/types/api'
import {
  buildCustomsPostOptions, filterCustomsPostOption, foldSearch, postCodeOf, shortLocation, toLatin, transportParts,
} from '../customsPosts'

// Посты — по снимку справочника КЕДЕН (crm-server/docs/keden-dt-dicts-2026-10-06.json), имена — как в нашем справочнике.
const post = (name: string, transportKind: string | null = null, location: string | null = null, code?: string): CustomsPostItem =>
  ({ id: name, name, isActive: true, transportKind, location, ...(code ? { code } : {}) })

const POSTS: CustomsPostItem[] = [
  post('55101 — ТАМОЖЕННЫЙ ПОСТ «АСТАНА – ЦЕНТР ТАМОЖЕННОГО ОФОРМЛЕНИЯ»', null, 'РЕСПУБЛИКА КАЗАХСТАН Г.АСТАНА, ТРАССА АСТАНА-КАРАГАНДА, 45'),
  post('55103 — ТАМОЖЕННЫЙ ПОСТ «АУЕЖАЙ-АСТАНА»', 'AIR', 'РЕСПУБЛИКА КАЗАХСТАН Г.АСТАНА, МЕЖДУНАРОДНЫЙ АЭРОПОРТ', '55103'),
  post('55301 — ТАМОЖЕННЫЙ ПОСТ «ЖЕТЫСУ»', 'AIR', 'РЕСПУБЛИКА КАЗАХСТАН 050079 Г.АЛМАТЫ, УЛ.АХМЕТОВА, 51, УЛ.МАЙЛИНА, 2'),
  post('55302 — ТАМОЖЕННЫЙ ПОСТ «АЛМАТЫ – ЦЕНТР ТАМОЖЕННОГО ОФОРМЛЕНИЯ»', null, 'РЕСПУБЛИКА КАЗАХСТАН 050016 Г.АЛМАТЫ, ПР.СУЮНБАЯ, 2'),
  post('55303 — ТАМОЖЕННЫЙ ПОСТ «СПЕЦИАЛЬНАЯ ЭКОНОМИЧЕСКАЯ ЗОНА «ПАРК ИНОВАЦИОННЫХ ТЕХНОЛОГИЙ»'),
  post('55521 — ТАМОЖЕННЫЙ ПОСТ «СЭЗ ТУРАН»'),
  post('57504 — ТАМОЖЕННЫЙ ПОСТ «ТЕМИРЖОЛ»', 'RW', 'РЕСПУБЛИКА КАЗАХСТАН , ОБЛАСТЬ ЖЕТІСУ, АЛАКОЛЬСКИЙ Р-Н, СТ.ДОСТЫК, УЛ.ПРИВОКЗАЛЬНАЯ, 11'),
  post('57505 — ТАМОЖЕННЫЙ ПОСТ «НҰР ЖОЛЫ»', 'AUTO', 'РЕСПУБЛИКА КАЗАХСТАН, ОБЛАСТЬ ЖЕТІСУ, ПАНФИЛОВСКИЙ РАЙОН'),
  // Засеян, синк ещё не прошёл: ни вида транспорта, ни адреса.
  post('51810 — ТАМОЖЕННЫЙ ПОСТ «АУЕЖАЙ-КАРАГАНДА»'),
  // Старая строка без кода (первый сид 10.06).
  post('Хоргос — ЦТО'),
]
const KIND: Record<string, string> = { AIR: 'авиа', AUTO: 'авто', RW: 'ж/д', VESSEL: 'море' }
const options = buildCustomsPostOptions(POSTS, (k) => KIND[k])
const find = (q: string) => options.filter((o) => filterCustomsPostOption(q, o)).map((o) => o.code ?? o.label)

describe('customsPosts: код, название, подсказка', () => {
  it('postCodeOf: код — ведущие 5+ цифр перед тире', () => {
    expect(postCodeOf('55302 — ТАМОЖЕННЫЙ ПОСТ «АЛМАТЫ – ЦТО»')).toBe('55302')
    expect(postCodeOf('Хоргос — ЦТО')).toBeNull()
    expect(postCodeOf('12 — что-то')).toBeNull()
  })

  it('foldSearch: регистр, казахские буквы, знаки → пробел', () => {
    expect(foldSearch('«НҰР ЖОЛЫ»')).toBe('нур жолы')
    expect(foldSearch('Нур-Жолы')).toBe('нур жолы')
    expect(foldSearch('ӘУЕЖАЙ · Қонаев, Ұлытау, Оңтүстік, Һ, Ғ, Ө, І, Ё')).toBe('ауежай конаев улытау онтустик х г о и е')
    expect(foldSearch('Qaragandy, Aqtobe')).toBe('karagandy aktobe')
  })

  it('toLatin: латиница свёрнутого текста', () => {
    expect(toLatin('г алматы ул ахметова 51')).toBe('g almaty ul akhmetova 51')
    expect(toLatin('хоргос шымкент жетысу усть каменогорск щучинск')).toBe('khorgos shymkent zhetysu ust kamenogorsk shchuchinsk')
  })

  it('опция: значение и подпись — полное имя, код, название без кода, вторая строка из КЕДЕН', () => {
    const o = options.find((x) => x.code === '55301')!
    expect(o).toMatchObject({
      value: '55301 — ТАМОЖЕННЫЙ ПОСТ «ЖЕТЫСУ»',
      label: '55301 — ТАМОЖЕННЫЙ ПОСТ «ЖЕТЫСУ»',
      title: '«ЖЕТЫСУ»',
      hint: 'авиа · Г.АЛМАТЫ, УЛ.АХМЕТОВА, 51, УЛ.МАЙЛИНА, 2',
    })
    expect(options.find((x) => x.code === '57504')!.hint).toBe('ж/д · ОБЛАСТЬ ЖЕТІСУ, АЛАКОЛЬСКИЙ Р-Н, СТ.ДОСТЫК, УЛ.ПРИВОКЗАЛЬНАЯ, 11')
    expect(options.find((x) => x.code === '51810')!.hint).toBe('')
    // КПП с постом в конце — название целиком; «Т/П» в начале убирается, как и «ТАМОЖЕННЫЙ ПОСТ».
    const [kpp, tp] = buildCustomsPostOptions([
      post('55515 — КПП «ЦЕЛИННЫЙ» ТАМОЖЕННЫЙ ПОСТ «АТАМЕКЕН»'),
      post('55521 — Т/П "СЭЗ ТУРАН"'),
    ], (k) => KIND[k])
    expect([kpp.title, tp.title]).toEqual(['КПП «ЦЕЛИННЫЙ» ТАМОЖЕННЫЙ ПОСТ «АТАМЕКЕН»', '"СЭЗ ТУРАН"'])
    const old = options.find((x) => x.label === 'Хоргос — ЦТО')!
    expect(old).toMatchObject({ value: 'Хоргос — ЦТО', code: null, title: 'Хоргос — ЦТО', hint: '' })
  })

  it('вид транспорта: части через «/», неизвестные не попадают в подпись', () => {
    expect(transportParts('VESSEL/AUTO/RW')).toEqual(['VESSEL', 'AUTO', 'RW'])
    expect(transportParts('Auto')).toEqual(['AUTO'])
    expect(transportParts('HELI')).toEqual([])
    expect(transportParts(null)).toEqual([])
    const [port, odd] = buildCustomsPostOptions([
      post('50709 — ТАМОЖЕННЫЙ ПОСТ «МОРПОРТ»', 'VESSEL/AUTO/RW', 'РЕСПУБЛИКА КАЗАХСТАН, 130000, МАНГИСТАУСКАЯ ОБЛАСТЬ, ПОС. УМИРЗАК'),
      post('59999 — ПОСТ', 'HELI', null),
    ], (k) => KIND[k])
    expect(port.hint).toBe('море, авто, ж/д · МАНГИСТАУСКАЯ ОБЛАСТЬ, ПОС. УМИРЗАК')
    expect(odd.hint).toBe('')
  })

  it('shortLocation: без «РЕСПУБЛИКА КАЗАХСТАН» и индекса', () => {
    expect(shortLocation('РЕСПУБЛИКА КАЗАХСТАН , 110007 КОСТАНАЙСКАЯ ОБЛАСТЬ, Г.КОСТАНАЙ,УЛ.МАУЛЕНОВА, 21')).toBe('КОСТАНАЙСКАЯ ОБЛАСТЬ, Г.КОСТАНАЙ,УЛ.МАУЛЕНОВА, 21')
    expect(shortLocation('РЕСПУБЛИКА КАЗАХСТАН, 130502,МАНГИСТАУСКАЯ ОБЛАСТЬ, П. БАУТИНО')).toBe('МАНГИСТАУСКАЯ ОБЛАСТЬ, П. БАУТИНО')
    expect(shortLocation('РЕСПУБЛИКА КАЗАХСТАН')).toBe('')
    expect(shortLocation(null)).toBe('')
  })
})

describe('customsPosts: поиск', () => {
  it('пустой запрос — все посты', () => {
    expect(find('  ')).toHaveLength(POSTS.length)
  })

  it('по коду: целиком, частью, с пробелом', () => {
    expect(find('55302')).toEqual(['55302'])
    expect(find('553')).toEqual(['55301', '55302', '55303'])
    expect(find('55 302')).toEqual(['55302'])
    expect(find('99999')).toEqual([])
  })

  it('цифры ищутся в коде, а не в адресе: «51» не находит 55301 по «Ахметова, 51»', () => {
    const r = find('51')
    expect(r).not.toContain('55301')
    expect(r).toContain('51810')
  })

  it('казахские буквы и дефисы: «нур жолы», «Нур-Жолы», «әуежай»', () => {
    expect(find('нур жолы')).toEqual(['57505'])
    expect(find('Нур-Жолы')).toEqual(['57505'])
    expect(find('әуежай')).toContain('55103')
  })

  it('синонимы: аэропорт/airport, цто, сэз', () => {
    expect(find('аэропорт астана')).toEqual(['55103'])
    expect(find('airport')).toEqual(['55103', '55301', '51810'])
    expect(find('авиа')).toEqual(['55103', '55301', '51810'])
    expect(find('алматы цто')).toEqual(['55302'])
    expect(find('сэз')).toEqual(['55303', '55521'])
    expect(find('специальная экономическая зона')).toEqual(['55303', '55521'])
  })

  it('по адресу из КЕДЕН: «достык» → 57504, «аэропорт алматы» → 55301', () => {
    expect(find('достык')).toEqual(['57504'])
    expect(find('аэропорт алматы')).toEqual(['55301'])
    // Пока синк не прошёл (ни вида транспорта, ни адреса) — 55301 по «аэропорт алматы» не находится.
    const bare = buildCustomsPostOptions([post('55301 — ТАМОЖЕННЫЙ ПОСТ «ЖЕТЫСУ»')], (k) => KIND[k])
    expect(bare.filter((o) => filterCustomsPostOption('аэропорт алматы', o))).toEqual([])
  })

  it('код и слово вместе: цифры — в коде, слова — в тексте', () => {
    expect(find('553 алматы')).toEqual(['55301', '55302'])   // у 55303 в тесте нет адреса
    expect(find('551 аэропорт')).toEqual(['55103'])
  })

  it('старая строка без кода находится по названию; чужая опция — по подписи', () => {
    expect(find('хоргос')).toEqual(['Хоргос — ЦТО'])
    expect(filterCustomsPostOption('нур', { value: 'x', label: 'Нұр жолы' })).toBe(true)
    expect(filterCustomsPostOption('12345', { value: 'x', label: 'Пост 12345' })).toBe(true)
  })
})

// Ревью 21.10: слова с окончаниями, казахские написания и латиница (kk/en-подсказки зовут вводить именно так).
describe('customsPosts: окончания, казахский, латиница', () => {
  it('окончания: «Алматы әуежайы», «пост аэропорта алматы», «Алматының», «Қарағанды әуежайы»', () => {
    expect(find('Алматы әуежайы')).toEqual(['55301'])
    expect(find('пост аэропорта алматы')).toEqual(['55301'])
    expect(find('Алматының әуежайы')).toEqual(['55301'])
    // 51810 ещё без данных КЕДЕН — находится по названию «АУЕЖАЙ-КАРАГАНДА».
    expect(find('Қарағанды әуежайы')).toEqual(['51810'])
    expect(find('Қарағандының әуежайы')).toEqual(['51810'])
    expect(find('аэропортом астаны')).toEqual(['55103'])
  })

  it('основа не расползается: «алматы» — не Алматинская область, «темиртау» — не «ТЕМИРЖОЛ»/«ТЕМИР-БАБА»', () => {
    const opts = buildCustomsPostOptions([
      post('55403 — ТАМОЖЕННЫЙ ПОСТ «КАЛЖАТ»', 'AUTO', 'РЕСПУБЛИКА КАЗАХСТАН , 041811 АЛМАТИНСКАЯ ОБЛАСТЬ, УЙГУРСКИЙ Р-Н, С.КАЛЖАТ'),
      post('51801 — ТАМОЖЕННЫЙ ПОСТ «ТЕМИРТАУ»', null, 'РЕСПУБЛИКА КАЗАХСТАН , КАРАГАНДИНСКАЯ ОБЛАСТЬ, Г. ТЕМИРТАУ'),
      post('50710 — ТАМОЖЕННЫЙ ПОСТ «ТЕМИР-БАБА»', 'AUTO'),
      post('57504 — ТАМОЖЕННЫЙ ПОСТ «ТЕМИРЖОЛ»', 'RW'),
    ], (k) => KIND[k])
    const hit = (q: string) => opts.filter((o) => filterCustomsPostOption(q, o)).map((o) => o.code)
    expect(hit('алматы')).toEqual([])
    expect(hit('Almaty')).toEqual([])
    expect(hit('темиртау')).toEqual(['51801'])
    expect(hit('караганда')).toEqual([])
  })

  it('казахские написания: «Қарағанды», «Жетісу», «Қорғас», «Түркістан»', () => {
    expect(find('Қарағанды')).toEqual(['55101', '51810'])   // 55101 — по адресу «ТРАССА АСТАНА-КАРАГАНДА», как и «караганда»
    expect(find('караганда')).toEqual(['55101', '51810'])
    expect(find('Жетісу')).toEqual(['55301', '57504', '57505'])   // 55301 «ЖЕТЫСУ» по названию, 57504/57505 — по адресу «ЖЕТІСУ»
    expect(find('Қорғас')).toEqual(['Хоргос — ЦТО'])
    const [tur] = buildCustomsPostOptions([post('55520 — ТАМОЖЕННЫЙ ПОСТ «ТУРКЕСТАН – ЦЕНТР ТАМОЖЕННОГО ОФОРМЛЕНИЯ – АУЕЖАЙ»')], (k) => KIND[k])
    expect(filterCustomsPostOption('Түркістан әуежайы', tur)).toBe(true)
    expect(filterCustomsPostOption('Turkestan', tur)).toBe(true)
  })

  it('казахские общие слова: «кеден бекеті», «кедендік ресімдеу орталығы», «арнайы экономикалық аймақ»', () => {
    expect(find('Алматы әуежайы кеден бекеті')).toEqual(['55301'])
    expect(find('Алматы кедендік ресімдеу орталығы')).toEqual(['55302'])
    expect(find('арнайы экономикалық аймақ')).toEqual(['55303', '55521'])
  })

  it('латиница: «Almaty», «airport almaty», «Karaganda», «Qaragandy», «Khorgos»/«Horgos», «sez»', () => {
    expect(find('Almaty')).toEqual(['55301', '55302'])   // у 55303 в тесте нет адреса
    expect(find('airport almaty')).toEqual(['55301'])
    expect(find('Karaganda')).toEqual(['55101', '51810'])
    expect(find('Qaragandy airport')).toEqual(['51810'])
    expect(find('Khorgos')).toEqual(['Хоргос — ЦТО'])
    expect(find('Horgos')).toEqual(['Хоргос — ЦТО'])
    expect(find('Nur Zholy')).toEqual(['57505'])
    expect(find('special economic zone')).toEqual(['55303', '55521'])
    expect(find('sez')).toEqual(['55303', '55521'])
    expect(find('customs post astana')).toEqual(['55101', '55103'])
  })

  it('вид транспорта ищется на языке интерфейса, как во второй строке варианта', () => {
    const en = buildCustomsPostOptions(POSTS, (k) => ({ AIR: 'air', AUTO: 'road', RW: 'rail', VESSEL: 'sea' })[k])
    expect(en.filter((o) => filterCustomsPostOption('rail', o)).map((o) => o.code)).toEqual(['57504'])
    expect(en.filter((o) => filterCustomsPostOption('road', o)).map((o) => o.code)).toEqual(['57505'])
  })
})
