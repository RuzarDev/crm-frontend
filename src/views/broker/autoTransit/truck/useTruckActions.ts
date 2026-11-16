import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { downloadBlob, fileUrl, zipUrl, type FileKind, type FilePatch, type Party, type TruckCard, type TruckFile } from '@/api/autoTransit'
import { confirmState, useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { stageKey } from '../autoTransit'
import type { TruckState } from './useTruck'
import { RECIPIENT_KINDS, lastMachineMark, primaryAction, recipientSees, sortedParties, truckLevelHidden } from './truckView'

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

  // Кнопки в тостах привязаны к своей машине: после ухода с карточки или перехода на другую машину — ничего.
  let alive = true
  if (getCurrentInstance()) onBeforeUnmount(() => { alive = false })
  const sameTruck = (truckId: string) => alive && id() === truckId

  // «Отменить» в тосте снимает только свою отметку: сервер отменяет последнюю отметку машины, поэтому если после неё
  // отметили следующий этап (или её уже отменили) — кнопка ничего не делает.
  const markStage = async (stage: number) => {
    const truckId = id()
    const res = await s.mark(stage)
    if (!res.ok) return
    const ownStillLast = () => !!s.card.value && s.card.value.id === truckId && lastMachineMark(s.card.value) === stage
    message.success({
      content: t(`${T}.marked`, { stage: t(stageKey(stage)) }),
      duration: UNDO_TOAST_SEC,
      action: { label: t(`${T}.undo`), onClick: () => { if (sameTruck(truckId) && ownStillLast()) void undo(truckId) } },
    })
  }
  const undo = async (truckId = id()) => {
    const res = await s.undo(truckId)
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
      // Файлы партии сервер оставляет общими документами машины (скрытыми), а ссылки получателя — удаляет.
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
  // Видимость получателю меняется только явно (решение 22): смена вида оставляет умолчание сервера для нового вида,
  // но тост говорит, кому теперь виден файл, и даёт «Скрыть» / «Показать»; перенос всегда скрывает файл.
  // «Виден» — как на деле (recipientSees, решение 32): общий документ машины получатели видят, только если это CMR.
  const F = 'broker.autoTransit.file'
  const setVisible = (truckId: string, fileId: string, visible: boolean) => {
    if (sameTruck(truckId)) void s.patchFile(fileId, { visibleToRecipient: visible }, truckId)
  }
  /** «В партию N» из тоста: пользователь сам попросил — файл вида для получателя сразу виден получателю этой партии. */
  const moveToParty = async (truckId: string, f: TruckFile, p: Party) => {
    if (!sameTruck(truckId)) return
    const show = RECIPIENT_KINDS.includes(f.kind)
    const res = await s.patchFile(f.id, { partyId: p.id, visibleToRecipient: show }, truckId)
    if (!res.ok) return
    const moved = res.card.files.find((x) => x.id === f.id)
    message.info({
      content: moved && recipientSees(moved) ? t(`${F}.visibleParty`, { n: p.number }) : t(`${F}.movedHidden`),
      duration: UNDO_TOAST_SEC,
      ...(moved && recipientSees(moved) ? { action: { label: t(`${F}.hide`), onClick: () => setVisible(truckId, f.id, false) } } : {}),
    })
  }
  const visibilityToast = (truckId: string, c: TruckCard, fileId: string, before: TruckFile) => {
    const f = c.files.find((x) => x.id === fileId)
    if (!f) return
    // Общий документ машины не CMR получатели не увидят при любом признаке: подсказываем перенести в партию
    // (только для видов, которые получателю нужны; паспорта и «прочее» — без шума).
    if (truckLevelHidden(f)) {
      if (!RECIPIENT_KINDS.includes(f.kind)) return
      const one = c.parties.length === 1 ? c.parties[0]! : null
      message.info({
        content: t(`${F}.truckLevelHidden`),
        duration: UNDO_TOAST_SEC,
        ...(one ? { action: { label: t(`${F}.toParty`, { n: one.number }), onClick: () => { void moveToParty(truckId, f, one) } } } : {}),
      })
      return
    }
    const sees = recipientSees(f)
    // Был скрыт и остался скрытым — тост ничего не сообщает.
    if (!sees && !recipientSees(before)) return
    const p = f.partyId ? c.parties.find((x) => x.id === f.partyId) : undefined
    if (sees) {
      message.info({
        content: p ? t(`${F}.visibleParty`, { n: p.number }) : t(`${F}.visibleAll`),
        duration: UNDO_TOAST_SEC,
        action: { label: t(`${F}.hide`), onClick: () => setVisible(truckId, fileId, false) },
      })
    } else {
      message.info({
        content: t(`${F}.hiddenAll`),
        duration: UNDO_TOAST_SEC,
        ...(RECIPIENT_KINDS.includes(f.kind) ? { action: { label: t(`${F}.show`), onClick: () => setVisible(truckId, fileId, true) } } : {}),
      })
    }
  }
  const patchFile = async (f: TruckFile, patch: FilePatch) => {
    const truckId = id()
    if (patch.partyId !== undefined) {
      if ((patch.partyId ?? null) === f.partyId) return
      const res = await s.patchFile(f.id, { partyId: patch.partyId, visibleToRecipient: false }, truckId)
      if (res.ok) {
        // Кнопка говорит, кому файл станет виден: получателю своей партии или всем получателям машины.
        const moved = res.card.files.find((x) => x.id === f.id)
        const p = moved?.partyId ? res.card.parties.find((x) => x.id === moved.partyId) : undefined
        message.info({
          content: t(`${F}.movedHidden`),
          duration: UNDO_TOAST_SEC,
          action: { label: p ? t(`${F}.showParty`, { n: p.number }) : t(`${F}.showAll`), onClick: () => setVisible(truckId, f.id, true) },
        })
      }
      return
    }
    if (patch.kind !== undefined) {
      if (patch.kind === f.kind) return
      const res = await s.patchFile(f.id, { kind: patch.kind }, truckId)
      if (res.ok) visibilityToast(truckId, res.card, f.id, f)
      return
    }
    // Общий не-CMR документ «показать» нельзя: получатели его не увидят (пункт меню выключен, это страховка).
    if (patch.visibleToRecipient === true && truckLevelHidden(f)) return
    await s.patchFile(f.id, patch, truckId)
  }
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
  /** Загрузка прямо в партию (пунктирный чип «нет …» или «+ файл» в карточке партии) — через ту же очередь. */
  const uploadToParty = (p: Party, files: File[], kind: FileKind, stamped = false) =>
    s.upload(files, { partyId: p.id, kind }, { stamped })

  const parties = computed(() => (s.card.value ? sortedParties(s.card.value) : []))

  return {
    editOpen, problemOpen, linksOpen, partyOpen, partyEditing, tdOpen, tdParty, anyOpen,
    primary, primaryRunning, onPrimary, onMenu, clearProblem,
    newParty, editParty, removeParty, submit, unsubmit, openTd,
    zipping, download, downloadZip, patchFile, removeFile, upload, uploadToParty, parties,
  }
}
