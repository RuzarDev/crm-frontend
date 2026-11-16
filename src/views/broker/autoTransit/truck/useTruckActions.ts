import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { downloadBlob, fileUrl, zipUrl, type FilePatch, type Party, type TruckFile } from '@/api/autoTransit'
import { confirmState, useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { stageKey } from '../autoTransit'
import type { TruckState } from './useTruck'
import { primaryAction, sortedParties } from './truckView'

// Действия экрана карточки поверх useTruck: окна, подтверждения, тосты, скачивание. Отметка этапа — без
// подтверждения, после неё ~6 с тост с «Отменить» (ошибочное нажатие, спека 4.4).
export const UNDO_TOAST_SEC = 6

export function useTruckActions(s: TruckState, id: () => string) {
  const { t } = useI18n()
  const { confirm } = useConfirm()
  const T = 'broker.autoTransit.truck'

  // ---- Окна (пока открыто любое — карточка не перечитывается) ----
  const editOpen = ref(false)
  const problemOpen = ref(false)
  const linksOpen = ref(false)
  const partyOpen = ref(false)
  const partyEditing = ref<Party | null>(null)
  const tdOpen = ref(false)
  const tdParty = ref<Party | null>(null)
  const anyOpen = () => editOpen.value || problemOpen.value || linksOpen.value || partyOpen.value || tdOpen.value || confirmState.open

  const primaryRunning = ref(false)
  const primary = computed(() => (s.card.value ? primaryAction(s.card.value, t) : null))

  const markStage = async (stage: number) => {
    const res = await s.mark(stage)
    if (!res.ok) return
    message.success({
      content: t(`${T}.marked`, { stage: t(stageKey(stage)) }),
      duration: UNDO_TOAST_SEC,
      action: { label: t(`${T}.undo`), onClick: () => { void undo() } },
    })
  }
  const undo = async () => {
    const res = await s.undo()
    if (res.ok) message.success(t(`${T}.undone`))
  }
  const openTd = (p: Party) => {
    tdParty.value = p
    tdOpen.value = true
  }
  const submit = async (p: Party) => {
    const res = await s.submit(p.id)
    if (res.ok) message.success(t('broker.autoTransit.party.submittedToast', { n: p.number }))
  }
  const unsubmit = (p: Party) => s.unsubmit(p.id)

  /** pickFiles — открыть выбор файлов (этап 1: «Добавить документы»). */
  const onPrimary = async (pickFiles: () => void) => {
    const p = primary.value
    const card = s.card.value
    if (!p || !card || p.kind === 'none' || primaryRunning.value) return
    if (p.kind === 'upload') return pickFiles()
    const party = 'partyId' in p ? card.parties.find((x) => x.id === p.partyId) : undefined
    if (p.kind === 'td') return party && openTd(party)
    primaryRunning.value = true
    try {
      if (p.kind === 'submit' && party) await submit(party)
      else if (p.kind === 'mark') await markStage(p.stage)
    } finally {
      primaryRunning.value = false
    }
  }

  const onMenu = async (key: string) => {
    if (key === 'edit') editOpen.value = true
    else if (key === 'problem') problemOpen.value = true
    else if (key === 'undo') await undo()
    else if (key === 'clearProblem') await clearProblem()
    else if (key === 'archive') {
      const ok = await confirm({ title: t(`${T}.archiveConfirm.title`), content: t(`${T}.archiveConfirm.text`), okText: t(`${T}.archiveConfirm.ok`), danger: true })
      if (ok && (await s.archive()).ok) message.success(t(`${T}.archivedToast`))
    }
  }
  const clearProblem = async () => {
    if ((await s.clearProblem()).ok) message.success(t(`${T}.problemCleared`))
  }

  // ---- Партии ----
  const newParty = () => {
    partyEditing.value = null
    partyOpen.value = true
  }
  const editParty = (p: Party) => {
    partyEditing.value = p
    partyOpen.value = true
  }
  const removeParty = async (p: Party) => {
    const ok = await confirm({
      title: t('broker.autoTransit.party.deleteConfirm.title', { n: p.number }),
      content: t('broker.autoTransit.party.deleteConfirm.text'),
      okText: t('broker.autoTransit.party.deleteConfirm.ok'),
      danger: true,
    })
    if (ok && (await s.deleteParty(p.id)).ok) message.success(t('broker.autoTransit.party.deleted'))
  }

  // ---- Файлы ----
  const zipping = ref(false)
  const download = async (f: TruckFile) => {
    try {
      const { blob, fileName } = await downloadBlob(fileUrl(id(), f.id), f.fileName)
      saveBlob(blob, fileName)
    } catch {
      // тост показал перехватчик
    }
  }
  const downloadZip = async () => {
    if (zipping.value) return
    zipping.value = true
    try {
      const { blob, fileName } = await downloadBlob(zipUrl(id()), `${s.card.value?.plate ?? 'truck'}.zip`)
      saveBlob(blob, fileName)
    } catch {
      // тост показал перехватчик
    } finally {
      zipping.value = false
    }
  }
  const patchFile = (f: TruckFile, patch: FilePatch) => s.patchFile(f.id, patch)
  const removeFile = async (f: TruckFile) => {
    const ok = await confirm({
      title: t('broker.autoTransit.file.deleteConfirm.title'),
      content: t('broker.autoTransit.file.deleteConfirm.text', { name: f.fileName }),
      okText: t('broker.autoTransit.file.deleteConfirm.ok'),
      danger: true,
    })
    if (ok) await s.deleteFile(f.id)
  }
  const upload = (files: File[]) => s.upload(files, {})

  const parties = computed(() => (s.card.value ? sortedParties(s.card.value) : []))

  return {
    editOpen, problemOpen, linksOpen, partyOpen, partyEditing, tdOpen, tdParty, anyOpen,
    primary, primaryRunning, onPrimary, onMenu, clearProblem,
    newParty, editParty, removeParty, submit, unsubmit, openTd,
    zipping, download, downloadZip, patchFile, removeFile, upload, parties,
  }
}
