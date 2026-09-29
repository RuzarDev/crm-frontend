// Проверка разбора адреса ГБД ЮЛ (тест-раннера во фронте нет): node scripts/kzAddress.check.mts
import { parseKzAddress } from '../src/utils/kzAddress.ts'
const cases: [string, any][] = [
 ['город Алматы, Жетысуский район, улица Мамина-Сибиряка, дом 2А', {city:'Алматы', district:'Жетысуский район', street:'улица Мамина-Сибиряка', house:'2А', apt:null}],
 ['Республика Казахстан, город Алматы, ЖЕТЫСУСКИЙ РАЙОН, УЛ. МАМИНА-СИБИРЯКА, Д. 2А', {city:'Алматы', district:'ЖЕТЫСУСКИЙ РАЙОН', street:'УЛ. МАМИНА-СИБИРЯКА', house:'2А', apt:null}],
 ['Казахстан, г.Астана, Медеуский район, ул. Толе би, д. 49, н.п. 1', {city:'Астана', district:'Медеуский район', street:'ул. Толе би', house:'49', apt:'1'}],
 ['Республика Казахстан, Акмолинская область, г.Кокшетау, ул.Ауэзова, 189', {region:'Акмолинская область', city:'Кокшетау', street:'ул.Ауэзова', house:'189'}],
 ['Алматинская область, район Сарайшык, трасса Алматы-Астана, зд. 15/1', {region:'Алматинская область', district:'район Сарайшык', street:'трасса Алматы-Астана', house:'15/1'}],
 ['г. Алматы, ул. Абая 15, оф. 101', {city:'Алматы', street:'ул. Абая 15', apt:'101'}],
 ['г. Алматы, УЛ. АБАЯ Д. 2А КВ. 5', {city:'Алматы', street:'УЛ. АБАЯ', house:'2А', apt:'5'}],
 ['г. Алматы, пр. Рыскулова, дом 61B, офис 12, тел. +7 701 000 00 00', {city:'Алматы', street:'пр. Рыскулова', house:'61B', apt:'12'}],
 ['г. Алматы, ул. Районная, 5', {city:'Алматы', district:null, street:'ул. Районная', house:'5'}],
]
// область и район — раздельно: «… ОБЛАСТЬ» → region, «… РАЙОН» → district (не в region); «Г.АЛМАТЫ» разбирается как город
cases.push(['Алматинская область, Илийский район, пос. Отеген батыра, ул. Абая, д. 5', {region:'Алматинская область', district:'Илийский район', house:'5'}])
cases.push(['Г.АЛМАТЫ, ЖЕТЫСУСКИЙ РАЙОН, УЛ. МАМИНА-СИБИРЯКА, Д. 2А', {region:null, city:'АЛМАТЫ', district:'ЖЕТЫСУСКИЙ РАЙОН', street:'УЛ. МАМИНА-СИБИРЯКА', house:'2А'}])
cases.push(['Медеуский район, ул. Толе би, д. 49', {region:null, district:'Медеуский район', house:'49'}])
let bad=0
for (const [s, exp] of cases) {
  const r = parseKzAddress(s)
  for (const k of Object.keys(exp)) if (r[k as keyof typeof r] !== exp[k]) { bad++; console.log('FAIL', s, k, JSON.stringify(r[k as keyof typeof r]), '!=', exp[k]) }
}
if (bad) { console.error(`FAILED: ${bad}`); process.exit(1) }
console.log('kzAddress: all cases OK')
