// Загрузка и сохранение ДТ (Импорт 40) для страницы ДТ — волна 6а, Task 2. Перенос из Import40DtView.vue
// (loadDt, applyDeclaration, saveDt/saveDtNow, автосейв, защита от ухода) с правилами срочной правки 09.10.
//
// - Загрузка: GET заявки (тихо) и поиск ДТ в ней; 404/403/400 или ДТ нет в заявке — notFound, иначе loadError.
//   Загрузка (и перезагрузка после 409) сначала ждёт уже идущее сохранение — GET видит его отметку.
//   onLoadStart — страница сбрасывает в нём ошибки XML и готовность прежней ДТ (readiness.reset()).
//   Форма заполняется под флагом applying (снимается после nextTick): авто-правила и автосейв загрузку не видят.
//   Пустые гр.2/8/22 — из данных клиента (prefillFromClientCase), сохранятся с первой правкой.
// - Автосейв: правка → editVersion++, dirty; через 2,5 с тишины — тихий save(). Идёт сохранение — попробовать позже.
//   Правки, сделанные во время запроса, досохраняются (editVersion сравнивается с началом запроса).
// - Сохранения строго по очереди: каждый PUT при отправке читает свежую форму и отметку updatedAtUtc из ответа
//   предыдущего (expectedUpdatedAtUtc, оптимистичная блокировка). Тело — formToPayload (все графы шапки).
// - Ошибка: постоянный текст saveError, dirty, автоповтор через 15 с — только при праве править.
//   409 («ДТ изменена в другом окне…»): conflict — автосейв, автоповтор и ручное сохранение стоят, поставленные
//   в очередь сохранения возвращают false; снимает только reload(). Тоста нет (PUT с silentStatuses: [409]).
// - Без права править (canEdit) или ДТ заменена после разделения: save() ничего не шлёт и возвращает false,
//   правки не копятся. saveForAction() (печать, документы) в этом случае сразу даёт «можно» (баг B2).
// - Ответ PUT не переписывает форму (правки во время запроса не теряются): он в lastServerDto — серверная гр.12,
//   флаги разделения, отметка блокировки.
// - beforeunload и уход внутри приложения (useConfirm) — при несохранённом и праве править; таймеры гаснут
//   при размонтировании.
import {
  computed,
  getCurrentInstance,
  nextTick,
  onScopeDispose,
  reactive,
  ref,
  shallowRef,
  toValue,
  unref,
  watch,
  type MaybeRef,
  type MaybeRefOrGetter,
} from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { import40Api, type Import40CaseDto, type Import40DeclarationDto } from '@/api/import40'
import { i18n } from '@/i18n'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { serverErrorText } from '@/utils/serverError'
import { saveBeforeAction } from '@/views/import40/dtAccess'
import { dtoToForm, emptyDtForm, formToPayload, prefillFromClientCase, type DtFormState } from './dtPayload'

export const DT_AUTOSAVE_MS = 2500
export const DT_RETRY_MS = 15000

export interface UseDtFormOptions {
  /**
   * Можно ли править (dtAccess.canEditDt). Функция получает загруженную заявку (null — ещё не загружена):
   * право зависит от статуса и назначенного декларанта, а заявку грузит сам useDtForm.
   */
  canEdit: ((kase: Import40CaseDto | null) => boolean) | MaybeRef<boolean>
  /** Началась загрузка или перезагрузка ДТ (например, сбросить ошибки XML и готовность прежней: readiness.reset()). */
  onLoadStart?: () => void
  /** ДТ загружена и применена к форме (например, спросить готовность). */
  onLoaded?: (dto: Import40DeclarationDto, kase: Import40CaseDto) => void
  /** Успешное сохранение (например, сбросить ошибки XML и спросить готовность). */
  onSaved?: (dto: Import40DeclarationDto) => void
}

const t = (key: string) => i18n.global.t(key)
const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status

export function useDtForm(caseId: MaybeRefOrGetter<string>, dtId: MaybeRefOrGetter<string>, opts: UseDtFormOptions) {
  const form = reactive<DtFormState>(emptyDtForm())
  const activeCase = shallowRef<Import40CaseDto | null>(null)
  /** Последний ответ сервера по ДТ (GET или PUT): серверная гр.12, флаги разделения. */
  const lastServerDto = shallowRef<Import40DeclarationDto | null>(null)
  const loading = ref(true)
  const loadError = ref(false)
  const notFound = ref(false)
  /** Идёт загрузка ДТ в форму — авто-правила и автосейв её не видят. */
  const applying = ref(false)
  const saving = ref(false)
  /** Есть правки после последнего удачного сохранения. */
  const dirty = ref(false)
  /** Текст последней ошибки сохранения (постоянная плашка); null — ошибки нет. */
  const saveError = ref<string | null>(null)
  /** Сервер ответил 409: ДТ сохранили в другом окне или другой пользователь. */
  const conflict = ref(false)
  const savedAt = ref<Date | null>(null)
  /** Растёт после каждого успешного сохранения (раздел ДТС перечитывает расчёт). */
  const savedCounter = ref(0)
  const editVersion = ref(0)

  const canEditNow = (): boolean =>
    typeof opts.canEdit === 'function' ? opts.canEdit(activeCase.value) : !!unref(opts.canEdit)
  /** Можно править: право и ДТ не заменена после разделения (сервер такой PUT отклонит). */
  const editable = computed(() => canEditNow() && !lastServerDto.value?.isSplitReplaced)

  // Отметка блокировки (updatedAtUtc как строка от сервера — не Date: точность до микросекунд). Не в форме —
  // иначе deep watch счёл бы её правкой.
  let serverStamp: string | null = null
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  /** Номер загрузки: устаревший ответ GET отбрасывается. */
  let seq = 0
  /** Поколение ДТ: сохранение, завершившееся после новой загрузки, её состояние не трогает. */
  let gen = 0
  // Очередь сохранений: два PUT одновременно ушли бы с одной отметкой — второй получил бы ложный 409.
  // Загрузка тоже ждёт её (см. load).
  let queue: Promise<unknown> = Promise.resolve()

  const clearAutosave = () => { if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null } }
  const clearRetry = () => { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null } }

  const apply = (dto: Import40DeclarationDto, kase: Import40CaseDto) => {
    applying.value = true
    Object.assign(form, dtoToForm(dto))
    prefillFromClientCase(form, kase)
    serverStamp = dto.updatedAtUtc ?? null
    lastServerDto.value = dto
    // Watchers на форму срабатывают после этого синхронного присвоения — флаг снимаем после них.
    void nextTick(() => { applying.value = false })
  }

  const load = async () => {
    const my = ++seq
    clearAutosave()
    clearRetry()
    loading.value = true
    loadError.value = false
    notFound.value = false
    opts.onLoadStart?.()
    try {
      // Сначала — сохранение, которое уже ушло (новые на время загрузки не стартуют: guard loading в saveNow).
      // Тогда GET видит применённый PUT и его отметку: без этого ответ PUT, пришедший после GET, либо оставлял
      // форму со старой отметкой (ложный 409), либо его отметку пришлось бы взять поверх данных GET, которые
      // этот PUT уже перезаписал (тихая потеря своих же правок). Отметка из GET всегда побеждает.
      await queue
      if (my !== seq) return
      gen++
      const kase = await import40Api.get(toValue(caseId), { silent: true })
      if (my !== seq) return
      activeCase.value = kase
      const dto = kase.declarations?.find((d) => d.id === toValue(dtId))
      if (!dto) {
        notFound.value = true
        return
      }
      conflict.value = false
      saveError.value = null
      dirty.value = false
      apply(dto, kase)
      opts.onLoaded?.(dto, kase)
    } catch (e) {
      if (my !== seq) return
      if ([404, 403, 400].includes(statusOf(e) ?? 0)) notFound.value = true
      else loadError.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }

  /** Перечитать ДТ с сервера («Повторить», после 409): несохранённое на экране пропадёт — спросить заранее. */
  const reload = () => load()

  function scheduleAutosave() {
    clearAutosave()
    if (disposed) return
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      if (applying.value || !editable.value || conflict.value || !form.id) return
      // Идёт сохранение — не теряем правку, а пробуем ещё раз чуть позже.
      if (saving.value) { scheduleAutosave(); return }
      void save()
    }, DT_AUTOSAVE_MS)
  }

  const saveNow = async (manual: boolean): Promise<boolean> => {
    // Без права, после 409, во время загрузки и до появления id — не сохраняем (сервер ответил бы 403/409).
    if (!form.id || !editable.value || conflict.value || loading.value || disposed) return false
    const myGen = gen
    const startedVersion = editVersion.value
    saving.value = true
    clearRetry()
    try {
      const updated = await import40Api.updateDeclaration(toValue(caseId), form.id, formToPayload(form, serverStamp))
      // Загрузка ждёт идущее сохранение (load → await queue), так что поколение здесь не меняется; проверка —
      // страховка, чтобы ответ прежней ДТ не попал в состояние новой.
      if (myGen !== gen) return true
      lastServerDto.value = updated
      serverStamp = updated.updatedAtUtc ?? serverStamp
      if (manual) message.success(t('dt.dtSohranena'))
      savedCounter.value += 1
      savedAt.value = new Date()
      saveError.value = null
      // Правки, сделанные пока шёл запрос, ещё не сохранены — остаёмся «грязными» и досохраняем.
      dirty.value = editVersion.value !== startedVersion
      if (dirty.value) scheduleAutosave()
      opts.onSaved?.(updated)
      return true
    } catch (e) {
      if (myGen !== gen) return false
      // Короткий тост показал общий перехватчик (кроме 409); здесь — постоянная плашка и автоповтор.
      saveError.value = serverErrorText(e, t('dt.netSvyazi'))
      dirty.value = true
      if (statusOf(e) === 409) {
        // Кто-то сохранил ДТ раньше: повтор только затёр бы чужие правки — стоп до перезагрузки.
        conflict.value = true
        clearAutosave()
        return false
      }
      if (editable.value && !disposed) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          if (dirty.value && !saving.value && editable.value) void save()
        }, DT_RETRY_MS)
      }
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Сохранить ДТ (по очереди за уже идущими). По умолчанию ТИХО — без тоста (автосейв, перед XML/расчётом);
   * manual=true — с тостом «ДТ сохранена»: ручное «Сохранить», ⌘S и действия, где прежний экран показывал тост.
   * true — сохранено; false — не сохранено (нет права, ДТ разделена, конфликт 409, ошибка, идёт загрузка).
   */
  const save = (manual = false): Promise<boolean> => {
    const run = queue.then(() => saveNow(manual))
    queue = run.catch(() => undefined)
    return run
  }

  /**
   * Сохранение перед действием (XML, печать, ДТС, разделение): в просмотре — сразу true без PUT (B2).
   * Как save(): по умолчанию тихо, manual=true — с тостом «ДТ сохранена».
   */
  const saveForAction = (manual = false): Promise<boolean> => saveBeforeAction(!editable.value, () => save(manual))

  watch(
    () => form,
    () => {
      if (applying.value || !editable.value || !form.id || loading.value) return
      editVersion.value += 1
      dirty.value = true
      if (conflict.value) return // правки копятся на экране, но не уходят
      scheduleAutosave()
    },
    { deep: true },
  )

  // Права больше нет (заявку перечитали, ДТ разделена) — гасим отложенное и плашку.
  watch(editable, (on) => {
    if (on) return
    clearAutosave()
    clearRetry()
    saveError.value = null
    dirty.value = false
  })

  watch(() => [toValue(caseId), toValue(dtId)] as const, () => { void load() }, { immediate: true })

  // ---- Защита от ухода ----
  const hasUnsaved = () => editable.value && (dirty.value || saving.value)
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!hasUnsaved()) return
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  const { confirm } = useConfirm()
  /** Уход со страницы внутри приложения: true — можно уходить. */
  const confirmLeave = async (): Promise<boolean> => {
    if (!hasUnsaved()) return true
    return confirm({
      title: t('broker.dt.leave.title'),
      content: t('broker.dt.leave.text'),
      okText: t('broker.dt.leave.leave'),
      cancelText: t('broker.dt.leave.stay'),
      danger: true,
    })
  }
  if (getCurrentInstance()) onBeforeRouteLeave(() => confirmLeave())

  onScopeDispose(() => {
    disposed = true
    clearAutosave()
    clearRetry()
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return {
    form,
    activeCase,
    lastServerDto,
    loading,
    loadError,
    notFound,
    applying,
    saving,
    dirty,
    saveError,
    conflict,
    savedAt,
    savedCounter,
    editVersion,
    editable,
    reload,
    save,
    saveForAction,
    confirmLeave,
  }
}

export type DtForm = ReturnType<typeof useDtForm>
