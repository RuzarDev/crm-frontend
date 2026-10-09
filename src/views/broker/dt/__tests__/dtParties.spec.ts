import { describe, expect, it } from 'vitest'
import type { CompanyLookupDto } from '@/api/companyLookup'
import type { ClientCompanyProfileDto } from '@/api/import40Contract'
import type { PartyRefDto } from '@/api/partyRefs'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import {
  changedOnly, copyDeclarant, toNumericCountry, lookupPatch, overLimit, profilePatch, readParty, refBody, refPatch, syncLoadedParties, writeParty,
} from '../dtParties'

const company = (o: Partial<CompanyLookupDto> = {}): CompanyLookupDto => ({
  bin: '201140012345', nameRu: 'ТОО «Казахмыс Трейд»', nameKz: null,
  addressRu: 'Республика Казахстан, г.Алматы, Алмалинский район, ул. Абая, д. 52, оф. 305',
  addressKz: null, director: null, okedRu: null, statusRu: null, dateReg: null, source: 'egov', fetchedAtUtc: '', ...o,
})
const declarantForm = (): DtFormState => Object.assign(emptyDtForm(), {
  declarantName: 'ТОО ДЕКЛАРАНТ', declarantShortName: 'ДЕКЛ', declarantBin: '111111111111', declarantCountryCode: '398',
  declarantRegion: 'D-REGION', declarantDistrict: 'D-DISTRICT', declarantCity: 'D-CITY', declarantSettlement: 'D-SETTLEMENT',
  declarantStreet: 'D-STREET', declarantHouse: '5', declarantApt: '6', declarantCategoryCode: '3', declarantKatoCode: '751110002',
})

describe('dtParties — модель стороны', () => {
  it('читает и пишет стороны по их полям формы (гр. 2 / 8 — часть во вложенном объекте)', () => {
    const f = emptyDtForm()
    writeParty(f, 'receiver', { name: 'R', countryCode: '398', city: 'C', house: '1', bin: '123', katoCode: 'K' })
    expect(f.receiver).toMatchObject({ name: 'R', countryCode: '398', city: 'C' })
    expect([f.receiverHouse, f.receiverBin, f.receiverKatoCode]).toEqual(['1', '123', 'K'])
    writeParty(f, 'sender', { name: 'S', settlement: 'P', bin: '999', katoCode: 'X' })
    expect(f.sender.name).toBe('S')
    expect(f.senderSettlement).toBe('P')
    expect(readParty(f, 'sender')).toMatchObject({ name: 'S', settlement: 'P', bin: null, katoCode: null, categoryCode: null })
    writeParty(f, 'financialSubject', { name: 'F', street: 'ST' })
    expect([f.financialSubjectName, f.financialSubjectStreet]).toEqual(['F', 'ST'])
    expect(readParty(f, 'declarant').name).toBeNull()
  })

  it('копия декларанта — все 13 полей в гр. 8 и гр. 9', () => {
    const f = declarantForm()
    copyDeclarant(f, 'receiver')
    copyDeclarant(f, 'financialSubject')
    expect(readParty(f, 'receiver')).toEqual(readParty(f, 'declarant'))
    expect(readParty(f, 'financialSubject')).toEqual(readParty(f, 'declarant'))
  })

  it('загрузка: копирует только с включённым флажком и непустым гр. 14', () => {
    const f = declarantForm()
    f.consigneeEqualsDeclarant = true
    f.receiver.name = 'СТАРЫЙ'
    f.financialSubjectName = 'СВОЙ'
    syncLoadedParties(f)
    expect(f.receiver.name).toBe('ТОО ДЕКЛАРАНТ')
    expect(f.financialSubjectName).toBe('СВОЙ')
    const empty = emptyDtForm()
    empty.consigneeEqualsDeclarant = true
    empty.receiver.name = 'ОСТАЁТСЯ'
    syncLoadedParties(empty)
    expect(empty.receiver.name).toBe('ОСТАЁТСЯ')
  })

  it('changedOnly — только отличающиеся поля', () => {
    const cur = readParty(declarantForm(), 'declarant')
    expect(changedOnly(cur, { name: 'ТОО ДЕКЛАРАНТ', city: 'НОВЫЙ', street: undefined })).toEqual({ city: 'НОВЫЙ' })
  })
})

describe('dtParties — подстановки', () => {
  it('БИН-поиск: наименование перезаписывается, краткое и адрес — только пустые, всё UPPER', () => {
    const f = emptyDtForm()
    f.declarantName = 'СТАРОЕ'
    f.declarantStreet = 'МОЯ УЛИЦА'
    const p = lookupPatch(readParty(f, 'declarant'), company(), [])
    expect(p.name).toBe('ТОО «КАЗАХМЫС ТРЕЙД»')
    expect(p.shortName).toBe('ТОО «КАЗАХМЫС ТРЕЙД»')
    expect(p.street).toBeUndefined()
    expect(p).toMatchObject({ city: 'АЛМАТЫ', district: 'АЛМАЛИНСКИЙ РАЙОН', house: '52', apt: '305' })
    expect(p.settlement).toBeUndefined()
    f.declarantShortName = 'КРАТКОЕ'
    expect(lookupPatch(readParty(f, 'declarant'), company(), []).shortName).toBe('КРАТКОЕ')
  })

  it('справочник: всё из записи в UPPER, района нет; у отправителя — без БИН, категории и КАТО', () => {
    const r: PartyRefDto = { id: '1', name: 'Shenzhen Co', shortName: 'sz', bin: '123456789012', countryCode: '156', city: 'shenzhen', region: null, street: 'keji rd', house: '7', apt: '1205', categoryCode: '2', katoCode: '751110000' }
    expect(refPatch('receiver', r, [])).toEqual({
      name: 'SHENZHEN CO', shortName: 'SZ', countryCode: '156', region: null, city: 'SHENZHEN', street: 'KEJI RD', district: null,
      house: '7', apt: '1205', bin: '123456789012', categoryCode: '2', katoCode: '751110000',
    })
    expect(refPatch('sender', r, [])).not.toHaveProperty('bin')
  })

  it('профиль клиента: свободный адрес разбирается, краткое — только пустое, БИН из профиля', () => {
    const p = {
      clientId: 'c', companyName: 'тоо клиент', bin: '222222222222', legalAddress: 'г. Астана, ул. Кенесары, д. 40, кв. 12',
      legalCountryCode: null, legalRegion: null, legalCity: null, legalStreet: null,
    } as unknown as ClientCompanyProfileDto
    const cur = readParty(emptyDtForm(), 'receiver')
    expect(profilePatch(cur, p, [])).toMatchObject({ name: 'ТОО КЛИЕНТ', shortName: 'ТОО КЛИЕНТ', bin: '222222222222', city: 'АСТАНА', street: 'УЛ. КЕНЕСАРЫ', house: '40', apt: '12' })
    expect(profilePatch({ ...cur, shortName: 'МОЁ' }, p, []).shortName).toBe('МОЁ')
  })

  it('тело справочника: у отправителя нет категории и КАТО', () => {
    const f = declarantForm()
    copyDeclarant(f, 'receiver')
    expect(refBody('receiver', readParty(f, 'receiver'))).toMatchObject({ name: 'ТОО ДЕКЛАРАНТ', bin: '111111111111', categoryCode: '3', katoCode: '751110002' })
    writeParty(f, 'sender', { name: 'S' })
    expect(refBody('sender', readParty(f, 'sender'))).toMatchObject({ name: 'S', categoryCode: null, katoCode: null })
  })

  it('длина: больше предела — число знаков без крайних пробелов', () => {
    expect(overLimit('BUILDING 7, ROOM 1205-1206', 20)).toBe(26)
    expect(overLimit(' 12345678901234567890 ', 20)).toBeNull()
    expect(overLimit(null, 20)).toBeNull()
  })
})

describe('dtParties — единый код страны (ОКСМ, «398», а не «KZ»)', () => {
  const countries = [{ value: '398', alpha2: 'KZ' }, { value: '156', alpha2: 'CN' }]

  it('буквенный код из старых записей — к цифровому по справочнику; Казахстан — и без справочника', () => {
    expect(toNumericCountry('KZ', countries)).toBe('398')
    expect(toNumericCountry('cn', countries)).toBe('156')
    expect(toNumericCountry('398', countries)).toBe('398')
    expect(toNumericCountry('KZ', [])).toBe('398')
    expect(toNumericCountry('XX', countries)).toBe('XX')
    expect(toNumericCountry(null, countries)).toBeNull()
  })

  it('БИН-поиск, справочник и профиль клиента ставят цифровой код', () => {
    const cur = readParty(emptyDtForm(), 'receiver')
    expect(lookupPatch(cur, company(), countries).countryCode).toBe('398')
    expect(lookupPatch({ ...cur, countryCode: 'KZ' }, company(), countries).countryCode).toBe('398')
    expect(lookupPatch({ ...cur, countryCode: '156' }, company(), countries).countryCode).toBe('156')
    const r = { id: '1', name: 'X', shortName: null, bin: null, countryCode: 'CN', city: null, region: null, street: null, house: null, apt: null, categoryCode: null, katoCode: null }
    expect(refPatch('sender', r, countries).countryCode).toBe('156')
    const p = { clientId: 'c', companyName: 'X', bin: null, legalAddress: null, legalCountryCode: null, legalRegion: null, legalCity: null, legalStreet: null } as unknown as ClientCompanyProfileDto
    expect(profilePatch(cur, p, countries).countryCode).toBe('398')
    expect(profilePatch(cur, { ...p, legalCountryCode: 'KZ' }, countries).countryCode).toBe('398')
  })
})
