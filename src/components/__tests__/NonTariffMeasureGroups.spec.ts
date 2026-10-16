import { describe, expect, it } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedNonTariffMeasureDto } from '@/types/api'
import NonTariffMeasureGroups from '../NonTariffMeasureGroups.vue'
import { cleanActNumber, formatActDate, groupMeasures, isGr33Doc } from '../nonTariffMeasures'
import { measures7308 } from './fixtures/ntm7308'

const m = (resolutionUrl: string | null, over: Partial<TnvedNonTariffMeasureDto> = {}): TnvedNonTariffMeasureDto =>
  ({ docType: 'RESTRICTION', name: 'Нотификация', comment: null, resolutionNumber: '30', resolutionName: 'Решение КТС', resolutionUrl, ...over })

describe('nonTariffMeasures: группировка', () => {
  it('7308200000: разделы по виду документа, внутри — акты в порядке КЕДЕН', () => {
    const sections = groupMeasures(measures7308)
    expect(sections.map((s) => s.key)).toEqual(['restrictions', 'preferences', 'others'])

    const [restr, pref, other] = sections
    expect(restr.acts.map((a) => a.number)).toEqual(['299', '710', '1', '435'])
    // 1 + 5 документов + строка кодов гр. 33 + 1
    expect(restr.count).toBe(8)
    expect(pref.acts.map((a) => a.number)).toEqual(['1151', '737'])
    expect(other.acts.map((a) => a.number)).toEqual(['45'])
  })

  it('акт: номер, дата, заголовок и изменения; документ — с товарами', () => {
    const act = groupMeasures(measures7308)[0].acts[0]
    expect(act).toMatchObject({
      name: 'Решение Комиссии Таможенного Союза',
      number: '299',
      date: '28.05.2010',
      title: 'О порядке осуществления государственного санитарно-эпидемиологического надзора (контроля)',
    })
    expect(act.amendments.map((a) => [a.name, a.number, a.date])).toEqual([['Решение Совета ЕЭК', '28', '2022-03-17']])
    expect(act.docs).toHaveLength(1)
    expect(act.docs[0].goods).toEqual(['Материалы, изделия и оборудование, контактирующие с пищевыми продуктами'])
  })

  it('«Документ запретов или ограничений» — не документ, а коды гр. 33: без повторов, по порядку', () => {
    const list = groupMeasures(measures7308)[0].acts.find((a) => a.number === '1')!
    expect(list.docs).toEqual([])
    expect(list.gr33).toEqual([
      'C1700', 'C1710', 'C1715', 'D0100', 'D0110', 'D0111', 'D0112', 'D0113', 'D0114',
      'D0115', 'D0116', 'D0117', 'D0118', 'D0119', 'D0120', 'D0121', 'D0122',
    ])
  })

  it('коды гр. 33 из нескольких строк одного акта сливаются; кириллица → латиница; не коды — обычный документ', () => {
    const name = 'Документ запретов или ограничений'
    const sections = groupMeasures([
      m(null, { name, goods: ['D0110', 'D0110'], resolutionNumber: '1' }),
      m(null, { name, goods: ['С1400', 'D0110'], resolutionNumber: '1' }),
      m(null, { name: 'Помещение под таможенные процедуры', goods: ['VETSerRaz  (F0110)'], resolutionNumber: '1' }),
    ])
    const act = sections[0].acts[0]
    expect(act.gr33).toEqual(['C1400', 'D0110'])
    expect(act.docs.map((d) => d.name)).toEqual(['Помещение под таможенные процедуры'])
    expect(sections[0].count).toBe(2)
    expect(isGr33Doc(m(null, { name, goods: [] }))).toBe(false)
  })

  it('by=required: всё, кроме льгот, — требуемые документы; NOTICE и неизвестный вид — в прочие', () => {
    expect(groupMeasures(measures7308, 'required').map((s) => [s.key, s.acts.length])).toEqual([['required', 5], ['preferences', 2]])
    expect(groupMeasures([m(null, { docType: 'NOTICE' }), m(null, { docType: 'X', resolutionNumber: '31' })]).map((s) => [s.key, s.acts.length]))
      .toEqual([['others', 2]])
  })

  it('дата и номер акта', () => {
    expect(formatActDate('2010-05-28')).toBe('28.05.2010')
    expect(formatActDate('2010-05-28T00:00:00')).toBe('28.05.2010')
    expect(formatActDate(null)).toBeNull()
    expect(cleanActNumber('№ 1204')).toBe('1204')
    expect(cleanActNumber(' ')).toBeNull()
  })
})

describe('NonTariffMeasureGroups: карточка 7308200000', () => {
  const mount = () => mountWithI18n(NonTariffMeasureGroups, { props: { measures: measures7308 } })

  it('разделы как в справке: меры нетарифного регулирования, льготы, прочая информация', () => {
    const w = mount()
    expect(w.findAll('[data-measure-group] h4').map((h) => h.findAll('span').map((x) => x.text()))).toEqual([
      ['Меры нетарифного регулирования', '8'], ['Льготы', '2'], ['Прочая информация', '1'],
    ])
    // виды документов КЕДЕН пользователю не показываем
    expect(w.text()).not.toMatch(/RESTRICTION|PREFERENCE|OTHER|NOTICE/)
  })

  it('строка акта — ссылка «… №299 от 28.05.2010 с изменениями …», заголовок, документ и товар', () => {
    const act = mount().findAll('[data-measure-act]')[0]
    const link = act.get('[data-measure-act-link]')
    expect(link.text()).toContain('Решение Комиссии Таможенного Союза №299 от 28.05.2010')
    expect(link.attributes('href')).toBe('http://adilet.zan.kz/rus/docs/H10T0000299')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    const line = act.get('[data-measure-act-line]').text()
    expect(line).toContain('с изменениями')
    const amendment = act.get('[data-measure-amendment]')
    expect(amendment.text()).toMatch(/^Решение Совета ЕЭК №28 от 17\.03\.2022/)
    expect(amendment.attributes('href')).toBe('https://docs.eaeunion.org/docs/ru-ru/01531459/err_18032022_28')
    expect(act.get('[data-measure-act-title]').text()).toBe('О порядке осуществления государственного санитарно-эпидемиологического надзора (контроля)')
    expect(act.get('[data-measure]').text()).toContain('подлежащей государственному санитарно-эпидемиологическому надзору')
    expect(act.get('[data-measure-goods]').text()).toBe('Материалы, изделия и оборудование, контактирующие с пищевыми продуктами')
  })

  it('коды гр. 33 — одной строкой чипов, а не 17 пунктами', () => {
    const w = mount()
    const row = w.get('[data-measure-gr33]')
    expect(row.text()).toContain('Коды запретов и ограничений для гр. 33:')
    expect(row.findAll('[data-gr33-code]')).toHaveLength(17)
    expect(w.findAll('[data-measure]').map((x) => x.text()).filter((x) => x.includes('Документ запретов'))).toEqual([])
  })

  it('длинный список товаров показан целиком', () => {
    const w = mount()
    const long = measures7308.flatMap((x) => x.goods ?? []).reduce((a, b) => (b.length > a.length ? b : a), '')
    expect(long.length).toBeGreaterThan(150)
    expect(w.findAll('[data-measure-goods] li').some((li) => li.text() === long)).toBe(true)
  })

  it('ссылка на акт: http(s) — ссылка с noopener; javascript:, data: и пустой адрес — просто текст', () => {
    const w = mountWithI18n(NonTariffMeasureGroups, {
      props: { measures: [m('https://eec.example/30'), m('javascript:alert(1)', { resolutionNumber: '31' }), m('data:text/html,x', { resolutionNumber: '32' }), m(null, { resolutionNumber: '33' })] },
    })
    const acts = w.findAll('[data-measure-act]')
    expect(acts).toHaveLength(4)
    expect(acts[0].get('a').attributes('href')).toBe('https://eec.example/30')
    expect(acts[0].get('a').attributes('rel')).toContain('noopener')
    expect(acts[0].text()).toContain('Решение КТС №30')
    for (const it of acts.slice(1)) {
      expect(it.find('a').exists()).toBe(false)
      expect(it.text()).toContain('Решение КТС')
    }
  })

  it('старые строки без товаров и дат — акт без «от», документ без подпунктов', () => {
    const w = mountWithI18n(NonTariffMeasureGroups, { props: { measures: [m(null, { comment: 'см. графу 4' })] } })
    expect(w.get('[data-measure-act-line]').text()).toBe('Решение КТС №30')
    expect(w.get('[data-measure-comment]').text()).toBe('см. графу 4')
    expect(w.find('[data-measure-goods]').exists()).toBe(false)
    expect(w.find('[data-measure-gr33]').exists()).toBe(false)
  })
})

describe('Льготы: перечень ПП РК № 1199 и заменённые акты КЕДЕН (№ 67 / № 83)', () => {
  // Как отдаёт сервер для 8423890000: меры КЕДЕН (приказ № 67 со статусом «заменён») и мера национального перечня.
  const old67: TnvedNonTariffMeasureDto = {
    docType: 'PREFERENCE', name: 'Входит в перечень импортируемых товаров, по которым НДС уплачивается методом зачета.', comment: null,
    resolutionNumber: '67', resolutionName: 'Приказ и.о. Министра национальной экономики РК', resolutionUrl: 'http://adilet.zan.kz/rus/docs/V1800016509',
    resolutionId: 'keden-67', resolutionDate: '2018-02-21',
    actStatus: { status: 'replaced', since: '2026-01-01', replacedBy: 'ПП РК № 1199 от 31.12.2025', replacedByUrl: 'https://adilet.zan.kz/rus/docs/P2500001199', note: 'Перечень с 01.01.2026 утверждает Правительство.', source: 'x' },
  }
  const pp1199: TnvedNonTariffMeasureDto = {
    docType: 'PREFERENCE', name: 'Входит в перечень импортируемых товаров, по которым НДС уплачивается методом зачета (строка 94)', comment: null,
    resolutionNumber: '1199', resolutionName: 'Постановление Правительства Республики Казахстан', resolutionUrl: 'https://adilet.zan.kz/rus/docs/P2500001199',
    resolutionId: 'KZ-VAT-OFFSET-PP-1199', resolutionDate: '2025-12-31',
    resolutionTitle: 'Об утверждении перечня импортируемых товаров, по которым налог на добавленную стоимость уплачивается методом зачета, и правил его формирования',
    goods: ['Только: Оборудование для взвешивания …: прочие: платформенные весы, весы рольганговые'],
    amendments: [{ name: 'Постановление Правительства Республики Казахстан', number: '611', url: 'https://adilet.zan.kz/rus/docs/P2600000611', title: null, date: '2026-07-13' }],
  }

  it('действующий перечень — первым в «Льготах»; заменённый акт — после него, с пометкой и ссылкой на замену', () => {
    const [pref] = groupMeasures([old67, pp1199])
    expect(pref.key).toBe('preferences')
    expect(pref.acts.map((a) => a.number)).toEqual(['1199', '67'])
    expect(pref.acts[0].status).toBeNull()
    expect(pref.acts[1].status?.replacedBy).toBe('ПП РК № 1199 от 31.12.2025')
  })

  it('карточка: акт № 1199 со ссылкой и изменениями, «Только: …»; № 67 — «Утратил силу с 01.01.2026, заменён: ПП РК № 1199»', () => {
    const w = mountWithI18n(NonTariffMeasureGroups, { props: { measures: [old67, pp1199] } })
    const acts = w.findAll('[data-measure-act]')
    expect(acts).toHaveLength(2)
    expect(acts[0].get('[data-measure-act-link]').text()).toContain('Постановление Правительства Республики Казахстан №1199 от 31.12.2025')
    expect(acts[0].text()).toContain('с изменениями')
    expect(acts[0].get('[data-measure-goods]').text()).toBe('Только: Оборудование для взвешивания …: прочие: платформенные весы, весы рольганговые')
    expect(acts[0].find('[data-measure-act-status]').exists()).toBe(false)

    expect(acts[1].attributes('data-act-status')).toBe('replaced')
    expect(acts[1].get('[data-measure-act-status]').text()).toMatch(/^Утратил силу с 01\.01\.2026, заменён:\s+ПП РК № 1199 от 31\.12\.2025/)
    expect(acts[1].get('[data-measure-replaced-by]').attributes('href')).toBe('https://adilet.zan.kz/rus/docs/P2500001199')
    expect(acts[1].get('[data-measure-act-status-note]').text()).toBe('Перечень с 01.01.2026 утверждает Правительство.')
  })
})
