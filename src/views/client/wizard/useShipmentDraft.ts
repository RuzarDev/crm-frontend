import { computed, getCurrentScope, onScopeDispose, reactive, ref, type Ref } from 'vue'
import { import40Api, type Import40CaseDto, type Import40UpdateRequest } from '@/api/import40'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import { normalizeCountryCode } from '@/utils/countries'
import type { RefCodeItem } from '@/types/api'

// Черновик поставки клиента (мастер «Оформить поставку», редизайн, волна 2a). Поля — те же, что у прежнего
// мастера в Import40ListView; заявка создаётся при уходе с шага «Груз» (ensureCreated), дальше — автосохранение:
// PUT заявки и синхронизация контейнеров по различию с тем, что уже лежит на сервере.
//
// Контейнеры по различию — исправление дублей: прежний мастер при каждом сохранении заново слал POST на все
// строки, и продолжение черновика удваивало контейнеры. Теперь у строк с сервера есть id: новые — POST,
// удалённые — DELETE, изменённые — PUT; повторное сохранение без правок не трогает контейнеры вовсе.

export interface DraftContainer {
  /** id контейнера на сервере; нет — строка ещё не сохранена. */
  id?: string
  number: string
  type: string
}

export interface ShipmentDraft {
  cargo: string
  post: string
  /** 0 = ЖД, 1 = Авто, 2 = Авиа, 3 = Море (IMPORT40_TRANSPORT_MODES). */
  transportMode: number
  vehicleNumber: string
  trailerNumber: string
  driverPhone: string
  wagonNumber: string
  station: string
  flightNumber: string
  airWaybill: string
  vesselName: string
  billOfLading: string
  containers: DraftContainer[]
  senderName: string
  /** Цифровой код ОКСМ. */
  senderCountry: string | null
  receiverName: string
  receiverBin: string
  /** Цифровой код ОКСМ; по умолчанию Казахстан (398), не буквенный 'KZ' (аудит 5.13). */
  receiverCountry: string | null
  currency: string | null
  estimatedValue: number | null
}

export const AUTOSAVE_DELAY_MS = 800

/** Груз годится для «Далее»: хотя бы два символа (как в прежнем мастере). */
export const isCargoOk = (cargo: string): boolean => cargo.trim().length > 1
/** БИН получателя необязателен, но если введён — ровно 12 цифр. */
export const isBinOk = (bin: string): boolean => {
  const v = bin.trim()
  return !v || /^\d{12}$/.test(v)
}

export const emptyDraft = (): ShipmentDraft => ({
  cargo: '',
  post: '',
  transportMode: 1,
  vehicleNumber: '',
  trailerNumber: '',
  driverPhone: '',
  wagonNumber: '',
  station: '',
  flightNumber: '',
  airWaybill: '',
  vesselName: '',
  billOfLading: '',
  containers: [],
  senderName: '',
  senderCountry: null,
  receiverName: '',
  receiverBin: '',
  receiverCountry: '398',
  currency: 'USD',
  estimatedValue: null,
})

/** Поля шагов 1–3 для PUT /import40/{id} — как persistWizardDraft прежнего мастера. */
export const draftPayload = (d: ShipmentDraft): Import40UpdateRequest => ({
  cargo: d.cargo.trim(),
  post: (d.post || '').trim(),
  transportMode: d.transportMode,
  vehicleNumber: d.vehicleNumber.trim(),
  trailerNumber: d.trailerNumber.trim(),
  driverPhone: d.driverPhone.trim(),
  wagonNumber: d.wagonNumber.trim(),
  station: d.station.trim(),
  flightNumber: d.flightNumber.trim(),
  airWaybill: d.airWaybill.trim(),
  vesselName: d.vesselName.trim(),
  billOfLading: d.billOfLading.trim(),
  clientSenderName: d.senderName.trim(),
  clientSenderCountryCode: d.senderCountry || '',
  clientReceiverName: d.receiverName.trim(),
  clientReceiverBin: d.receiverBin.trim(),
  clientReceiverCountryCode: d.receiverCountry || '',
  clientCurrencyCode: d.currency || '',
  clientEstimatedValue: d.estimatedValue,
})

const SILENT = { silent: true } as const
type Snapshot = { number: string; type: string }

export function useShipmentDraft(initialCaseId?: Ref<string | null>) {
  const authStore = useAuthStore()

  const draft = reactive<ShipmentDraft>(emptyDraft())
  const caseId = initialCaseId ?? ref<string | null>(null)
  const number = ref('')
  /** Статус заявки с сервера (0 — черновик); null — заявка ещё не создана/не загружена. */
  const status = ref<number | null>(null)
  const saving = ref(false)
  const savedAt = ref<Date | null>(null)
  const saveError = ref(false)
  /** Справочник стран: нужен и для выбора, и для приведения легаси-кодов (KZ → 398) при загрузке. */
  const countries = ref<RefCodeItem[]>([])
  /** Наименование компании для POST /import40 (сервер всё равно берёт его из профиля клиента). */
  const ownerName = ref('')

  // Что уже лежит на сервере: поля заявки (JSON последнего успешного PUT; null — не сохраняли) и контейнеры по id.
  let savedKey: string | null = null
  const serverContainers = new Map<string, Snapshot>()

  const payloadKey = () => JSON.stringify(draftPayload(draft))
  const norm = (c: DraftContainer): Snapshot => ({ number: c.number.trim(), type: c.type.trim() })

  /** Есть ли несохранённые правки (поля заявки или контейнеры). До создания — всегда false: сохранять некуда. */
  const containersDirty = () => {
    const live = draft.containers.filter((c) => c.number.trim())
    const ids = new Set(live.filter((c) => c.id).map((c) => c.id!))
    if ([...serverContainers.keys()].some((id) => !ids.has(id))) return true
    return live.some((c) => {
      if (!c.id) return true
      const was = serverContainers.get(c.id)
      const now = norm(c)
      return !was || was.number !== now.number || was.type !== now.type
    })
  }
  const isDirty = () => !!caseId.value && (payloadKey() !== savedKey || containersDirty())
  // Реактивная обёртка для шаблона/ухода со страницы: зависит от draft и сохранённого (через savedAt/saving).
  const dirty = computed(() => {
    void savedAt.value
    void saving.value
    return isDirty()
  })

  const loadCountries = async () => {
    if (countries.value.length) return
    try {
      countries.value = await referencesApi.listCountries({ silent: true })
    } catch {
      countries.value = []
    }
  }

  // ---- Создание (один раз, даже при параллельных вызовах) ----
  let creating: Promise<string> | null = null
  const ensureCreated = (): Promise<string> => {
    if (caseId.value) return Promise.resolve(caseId.value)
    if (!creating) {
      creating = (async () => {
        try {
          const created = await import40Api.create({
            clientId: authStore.userId ?? '',
            clientName: ownerName.value.trim() || authStore.username || '—',
            cargo: draft.cargo.trim(),
            post: (draft.post || '').trim(),
          })
          caseId.value = created.id
          number.value = created.number
          status.value = created.status
          // На сервере пока только груз и пост: первое сохранение отправит все поля.
          savedKey = null
          serverContainers.clear()
          savedAt.value = new Date()
          saveError.value = false
          return created.id
        } finally {
          creating = null
        }
      })()
    }
    return creating
  }

  // ---- Контейнеры по различию ----
  // В ответе на POST — вся заявка; id новой строки — тот, которого мы ещё не знали (с тем же номером).
  const takeNewId = (resp: Import40CaseDto, row: Snapshot): string | null => {
    const unknown = (resp.containers ?? []).filter((x) => !serverContainers.has(x.id))
    const hit = unknown.find((x) => x.containerNumber === row.number) ?? unknown[0]
    return hit?.id ?? null
  }
  const post = async (id: string, row: DraftContainer, snap: Snapshot) => {
    const resp = await import40Api.addContainer(id, { containerNumber: snap.number, containerType: snap.type }, SILENT)
    const newId = takeNewId(resp, snap)
    if (newId) {
      row.id = newId
      serverContainers.set(newId, snap)
    }
  }
  const syncContainers = async (id: string) => {
    // Строки без номера на сервер не уходят (номер обязателен); строка с id, у которой стёрли номер, — удаление.
    const live = draft.containers.filter((c) => c.number.trim())
    const liveIds = new Set(live.filter((c) => c.id).map((c) => c.id!))
    for (const goneId of [...serverContainers.keys()].filter((k) => !liveIds.has(k))) {
      await import40Api.deleteContainer(id, goneId, SILENT)
      serverContainers.delete(goneId)
    }
    for (const row of live) {
      const snap = norm(row)
      if (!row.id || !serverContainers.has(row.id)) {
        row.id = undefined
        await post(id, row, snap)
        continue
      }
      const was = serverContainers.get(row.id)!
      if (was.number === snap.number && was.type === snap.type) continue
      if (was.type && !snap.type) {
        // PUT не умеет стирать поле (пустое значение сервер считает «не менять») — заменяем строку.
        const oldId = row.id
        await import40Api.deleteContainer(id, oldId, SILENT)
        serverContainers.delete(oldId)
        row.id = undefined
        await post(id, row, snap)
      } else {
        await import40Api.updateContainer(id, row.id, { containerNumber: snap.number, containerType: snap.type }, SILENT)
        serverContainers.set(row.id, snap)
      }
    }
  }

  // ---- Сохранение: по одному за раз; вызов во время сохранения — ещё один проход после него ----
  let running: Promise<boolean> | null = null
  let queued: Promise<boolean> | null = null
  const run = async (): Promise<boolean> => {
    const id = caseId.value
    if (!id) return false
    if (!isDirty()) {
      saveError.value = false
      return true
    }
    saving.value = true
    try {
      const key = payloadKey()
      if (key !== savedKey) {
        const resp = await import40Api.update(id, draftPayload(draft), SILENT)
        savedKey = key
        if (resp?.number) number.value = resp.number
        if (typeof resp?.status === 'number') status.value = resp.status
      }
      await syncContainers(id)
      savedAt.value = new Date()
      saveError.value = false
      return true
    } catch {
      saveError.value = true
      return false
    } finally {
      saving.value = false
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const cancelScheduled = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const save = (): Promise<boolean> => {
    cancelScheduled()
    if (!running) {
      running = run().finally(() => { running = null })
      return running
    }
    if (!queued) {
      queued = running.then(() => {
        queued = null
        return save()
      })
    }
    return queued
  }

  /** Автосохранение: через AUTOSAVE_DELAY_MS после последнего изменения. До создания заявки — ничего. */
  const scheduleSave = () => {
    if (!caseId.value) return
    cancelScheduled()
    timer = setTimeout(() => {
      timer = null
      void save()
    }, AUTOSAVE_DELAY_MS)
  }

  if (getCurrentScope()) onScopeDispose(cancelScheduled)

  // ---- Загрузка черновика (продолжение) — как openContinue прежнего мастера ----
  const load = async (id: string): Promise<void> => {
    cancelScheduled()
    await loadCountries()
    const c = await import40Api.get(id, { silent: true })
    const list = countries.value
    Object.assign(draft, {
      cargo: c.cargo || '',
      post: c.post || '',
      transportMode: c.transportMode ?? 1,
      vehicleNumber: c.vehicleNumber || '',
      trailerNumber: c.trailerNumber || '',
      driverPhone: c.driverPhone || '',
      wagonNumber: c.wagonNumber || '',
      station: c.station || '',
      flightNumber: c.flightNumber || '',
      airWaybill: c.airWaybill || '',
      vesselName: c.vesselName || '',
      billOfLading: c.billOfLading || '',
      containers: (c.containers ?? []).map((x) => ({ id: x.id, number: x.containerNumber || '', type: x.containerType || '' })),
      senderName: c.clientSenderName || '',
      senderCountry: normalizeCountryCode(c.clientSenderCountryCode, list) || null,
      receiverName: c.clientReceiverName || '',
      receiverBin: c.clientReceiverBin || '',
      receiverCountry: normalizeCountryCode(c.clientReceiverCountryCode, list) || '398',
      currency: c.clientCurrencyCode || 'USD',
      estimatedValue: c.clientEstimatedValue ?? null,
    } satisfies ShipmentDraft)
    serverContainers.clear()
    for (const x of c.containers ?? []) {
      serverContainers.set(x.id, { number: (x.containerNumber || '').trim(), type: (x.containerType || '').trim() })
    }
    caseId.value = c.id
    number.value = c.number
    status.value = c.status
    savedKey = payloadKey()
    savedAt.value = null
    saveError.value = false
  }

  /** Новый пустой черновик (переход «Оформить поставку» из открытого черновика). */
  const reset = () => {
    cancelScheduled()
    Object.assign(draft, emptyDraft())
    caseId.value = null
    number.value = ''
    status.value = null
    savedKey = null
    serverContainers.clear()
    savedAt.value = null
    saveError.value = false
  }

  return {
    draft,
    caseId,
    number,
    status,
    saving,
    savedAt,
    saveError,
    dirty,
    countries,
    ownerName,
    loadCountries,
    ensureCreated,
    save,
    load,
    reset,
    scheduleSave,
    cancelScheduled,
  }
}

export type ShipmentDraftApi = ReturnType<typeof useShipmentDraft>
