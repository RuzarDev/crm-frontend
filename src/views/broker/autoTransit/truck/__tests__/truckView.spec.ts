import { describe, expect, it } from 'vitest'
import type { TruckStatus } from '@/api/autoTransit'
import { rights } from '../truckView'

const all = { border: true, declare: true, manage: true }
const r = (status: TruckStatus, currentStage: number | null = 3) => rights({ status, currentStage, can: all })

describe('truckView.rights: файлы по статусам', () => {
  it('в работе и в «Проблеме» — менять и удалять можно', () => {
    expect(r('inWork')).toMatchObject({ upload: true, patchFile: true, deleteFile: true })
    expect(r('problem')).toMatchObject({ upload: true, patchFile: true, deleteFile: true })
  })

  it('выпущена — загрузка и правка файла (вид, партия, печать, видимость) есть, удаления нет (решение 23)', () => {
    expect(r('released', null)).toMatchObject({ upload: true, patchFile: true, deleteFile: false, editParty: false, td: true })
  })

  it('архив — ничего', () => {
    expect(r('archived', null)).toMatchObject({ upload: false, patchFile: false, deleteFile: false, links: false, undo: false })
  })

  it('без прав границы и декларанта файл не меняется', () => {
    expect(rights({ status: 'released', currentStage: null, can: { border: false, declare: false, manage: true } }).patchFile).toBe(false)
  })
})
