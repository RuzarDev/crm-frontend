import { reactive } from 'vue'
import { vi } from 'vitest'
import type { ClassifierItem } from '@/types/api'
import { draftFromEntry, type RecordDraft } from '../../recordModel'
import { fullEntry } from '../../__tests__/recordFixture'

/** Моки referencesApi для SectionMain и SectionRow: vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi })). */
export const refsApi = {
  listStations: vi.fn(), listCustomsPosts: vi.fn(), listCountries: vi.fn(), listForeignCustomsOffices: vi.fn(),
  listOkeiUnits: vi.fn(), listClassifiers: vi.fn(),
}

export const POST_WITH_CODE = '57507 — ТАМОЖЕННЫЙ ПОСТ «АЛТЫНКОЛЬ-ЖОЛ»'
export const POST_LONG_NO_CODE = 'ТАМОЖЕННЫЙ ПОСТ «БЕЗ КОДА» С ОЧЕНЬ ДЛИННЫМ НАЗВАНИЕМ'

const cls = (code: string, nameRu: string): ClassifierItem => ({ id: code, classifierCode: 'x', code, nameRu, sortOrder: 0, isActive: true })

export function primeRefs() {
  refsApi.listStations.mockResolvedValue([{ id: 's1', name: 'Сарыагаш', isActive: true }, { id: 's2', name: 'Алтынколь', isActive: true }])
  refsApi.listCustomsPosts.mockResolvedValue([
    { id: 'p1', name: POST_WITH_CODE, isActive: true },
    { id: 'p2', name: POST_LONG_NO_CODE, isActive: true },
    { id: 'p3', name: 'КПП Хоргос', isActive: true },
  ])
  refsApi.listCountries.mockResolvedValue([
    { id: 'c1', code: '398', name: 'Казахстан', isActive: true },
    { id: 'c2', code: '156', name: 'Китай', isActive: true },
  ])
  refsApi.listForeignCustomsOffices.mockResolvedValue([{ id: 'f1', code: '10001', name: 'Хоргос', countryCode: 'CN', isActive: true }])
  refsApi.listOkeiUnits.mockResolvedValue([])
  refsApi.listClassifiers.mockImplementation(async (code: string) => [cls('A1', `${code}-one`), cls('A2', `${code}-two`)])
}

/** Z-поля с Reka (список в портале) — заглушки: кнопка на каждый вариант + выбранное значение в data-value. */
export const SelectStub = {
  props: ['value', 'options', 'disabled', 'invalid'],
  emits: ['update:value'],
  template: `<div data-select-stub :data-value="value ?? ''" :data-disabled="disabled ? 'true' : 'false'">
    <button v-for="o in options" :key="o.value" type="button" :data-option="o.value" :disabled="disabled" @click="$emit('update:value', o.value)">{{ o.label }}</button>
    <button type="button" data-clear @click="$emit('update:value', null)">x</button>
  </div>`,
}
export const ComboStub = {
  props: ['value', 'options', 'disabled'],
  emits: ['update:value'],
  template: `<div data-combo-stub :data-disabled="disabled ? 'true' : 'false'">
    <input :value="value ?? ''" :disabled="disabled" @input="$emit('update:value', $event.target.value)" />
    <button v-for="o in options" :key="o.value" type="button" :data-option="o.value" :disabled="disabled" @click="$emit('update:value', o.value)">{{ o.label }}</button>
  </div>`,
}

export const newDraft = (): RecordDraft => reactive(draftFromEntry(fullEntry())) as RecordDraft
