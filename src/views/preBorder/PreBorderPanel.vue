<script setup lang="ts">
import { computed, ref, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhMapPin, PhPencilSimple, PhTrash } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { extractServerText } from '@/api/client'
import { import40Api } from '@/api/import40'
import { preBorderApi, type PreBorder, type SerialNumber } from '@/api/preBorder'
import { fieldErrors as serverFieldErrors } from '@/api/nationalLists'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { formatNumberIn } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { dayMonth, missingText } from '@/utils/preBorder'
import PreBorderModal from './PreBorderModal.vue'
import SerialsModal from './SerialsModal.vue'

// «Поставка до границы» (очередь 4, задача 1) — в карточке поставки клиента и в карточке заявки сотрудника:
// оплата поставщику → погрузка (дата, место, пломбы, фото, серийные номера / IMEI) → в пути (перевозчик, номера,
// ожидаемая дата, ручные отметки «где сейчас») → прибытие (отметка КПП «Машина прибыла»). Необязательно: пока ничего
// не заполнено, клиенту — короткое приглашение, «Нужно от вас» не спрашивает.
const props = withDefaults(defineProps<{
  caseId: string
  data: PreBorder | null
  state: 'loading' | 'ready' | 'error'
  audience: 'client' | 'staff'
  compact?: boolean
}>(), { compact: false })
const emit = defineEmits<{ changed: [dto: PreBorder]; retry: [] }>()
const { t, locale } = useI18n()
const { confirm } = useConfirm()
const uid = useId()
const titleId = `pre-border-${uid}`
const client = computed(() => props.audience === 'client')

const d = computed(() => props.data)
const canEdit = computed(() => !!d.value?.canEdit)
const editOpen = ref(false)
const serialsOpen = ref(false)

const money = (n: number, cur: string) => `${formatNumberIn(locale.value, n, 2, 2)} ${cur}`
const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (iso: string) => {
  const x = new Date(iso)
  return Number.isNaN(x.getTime()) ? '' : `${pad(x.getDate())}.${pad(x.getMonth() + 1)} ${pad(x.getHours())}:${pad(x.getMinutes())}`
}

// ---- Сводка ----
const transportLine = computed(() => {
  const x = d.value
  if (!x) return ''
  const vehicle = x.vehicleNumber ? (x.trailerNumber ? `${x.vehicleNumber} / ${x.trailerNumber}` : x.vehicleNumber) : ''
  return [vehicle, x.wagonNumber ? t('preBorder.wagonShort', { n: x.wagonNumber }) : '', x.containerNumber ? t('preBorder.containerShort', { n: x.containerNumber }) : '']
    .filter(Boolean).join(' · ')
})
const loadingLine = computed(() => {
  const x = d.value
  if (!x) return ''
  return [x.loadingDate ? dayMonth(x.loadingDate) : '', x.loadingCity, x.loadingWarehouse].filter(Boolean).join(' · ')
})
const missing = computed(() => d.value?.missing ?? [])

// ---- Фото ----
const photoBusy = ref(false)
// Ход загрузки: «2 из 5». Фото уходят по одному — сбой одного не теряет уже загруженные.
const photoProgress = ref<{ done: number; total: number } | null>(null)
const uploadPhotos = async (files: File[]) => {
  if (!files.length || photoBusy.value) return
  photoBusy.value = true
  photoProgress.value = { done: 0, total: files.length }
  let ok = 0
  try {
    for (const f of files) {
      try {
        emit('changed', await preBorderApi.uploadPhoto(props.caseId, f))
        ok++
      } catch (e) {
        const res = (e as { response?: { status?: number; data?: unknown } })?.response
        // 400 общий перехватчик не показывает (silentStatuses): текст — тот же, что у него, — отказ по фото HEIC
        // ({ code: 'heic' }) на языке интерфейса, а не русский текст сервера (ревью 22.10).
        if (res?.status === 400) message.error(extractServerText(res.data, 400) || t('preBorder.saveError'))
        else if (res?.status === 413) message.error(t('preBorder.photos.tooLarge', { name: f.name }))
        else if (!res) message.error(t('preBorder.photos.failed', { name: f.name }))
        if (res?.status === 400 || !res) break
      }
      photoProgress.value = { done: photoProgress.value!.done + 1, total: files.length }
    }
    if (ok) message.success(t('preBorder.photos.saved', { n: ok }))
  } finally {
    photoBusy.value = false
    photoProgress.value = null
  }
}
const downloadPhoto = async (id: string, name: string) => {
  try {
    saveBlob(await import40Api.downloadFile(props.caseId, id), name)
  } catch { /* общий перехватчик */ }
}
const deletePhoto = async (id: string, name: string) => {
  const ok = await confirm({ title: t('preBorder.photos.deleteTitle'), content: name, okText: t('preBorder.delete'), danger: true })
  if (!ok) return
  try {
    emit('changed', await preBorderApi.deletePhoto(props.caseId, id))
  } catch { /* общий перехватчик */ }
}

// ---- Серийные номера ----
const listOpen = ref(false)
const serials = shallowRef<SerialNumber[]>([])
const serialsBusy = ref(false)
const LIST_SHOW = 500
const openList = async () => {
  listOpen.value = true
  serialsBusy.value = true
  try {
    serials.value = await preBorderApi.serials(props.caseId)
  } catch { serials.value = [] } finally { serialsBusy.value = false }
}
const clearSerials = async () => {
  const ok = await confirm({ title: t('preBorder.serials.clearTitle'), content: t('preBorder.serials.clearText', { n: d.value?.serialCount ?? 0 }), okText: t('preBorder.serials.clear'), danger: true })
  if (!ok) return
  try {
    emit('changed', await preBorderApi.clearSerials(props.caseId))
  } catch { /* общий перехватчик */ }
}
const onSerialsSaved = async () => {
  try {
    emit('changed', await preBorderApi.get(props.caseId))
  } catch { emit('retry') }
}

// ---- Отметки «где сейчас» ----
const nowParts = () => {
  const n = new Date()
  return { date: `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`, time: `${pad(n.getHours())}:${pad(n.getMinutes())}` }
}
const markOpen = ref(false)
const mark = ref({ date: '', time: '', place: '', comment: '' })
const markErrors = ref<Record<string, string>>({})
const markBusy = ref(false)
const openMark = () => {
  const n = nowParts()
  mark.value = { date: n.date, time: n.time, place: '', comment: '' }
  markErrors.value = {}
  markOpen.value = true
}
const saveMark = async () => {
  if (markBusy.value) return
  markErrors.value = {}
  if (!mark.value.place.trim()) { markErrors.value = { place: t('preBorder.marks.placeRequired') }; return }
  const at = mark.value.date ? new Date(`${mark.value.date}T${mark.value.time || '12:00'}`) : null
  markBusy.value = true
  try {
    emit('changed', await preBorderApi.addMark(props.caseId, {
      atUtc: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null, place: mark.value.place, comment: mark.value.comment,
    }))
    markOpen.value = false
  } catch (e) {
    markErrors.value = serverFieldErrors(e)
    const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
    if (!Object.keys(markErrors.value).length && res?.status === 400) message.error(res.data?.error || t('preBorder.saveError'))
  } finally {
    markBusy.value = false
  }
}
const deleteMark = async (id: string, place: string) => {
  const ok = await confirm({ title: t('preBorder.marks.deleteTitle'), content: place, okText: t('preBorder.delete'), danger: true })
  if (!ok) return
  try {
    emit('changed', await preBorderApi.deleteMark(props.caseId, id))
  } catch { /* общий перехватчик */ }
}

const block = 'flex min-w-0 flex-col gap-1.5 border-t border-line pt-3'
const h3 = 'm-0 text-[13px] font-semibold text-ink-2'
const line = 'm-0 text-sm text-ink [overflow-wrap:anywhere]'
const empty = 'm-0 text-sm text-ink-3'
const iconBtn = 'inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink-3 outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-8 sm:min-w-8'
const linkBtn = 'inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent p-0 font-sans text-sm font-medium text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus sm:min-h-8'
</script>

<template>
  <section :aria-labelledby="titleId" data-pre-border>
    <div class="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 :id="titleId" :class="cn('m-0 min-w-0 flex-1 font-semibold text-ink', compact ? 'text-sm' : 'text-[15px] leading-6')">{{ t('preBorder.title') }}</h2>
      <ZButton v-if="canEdit && state === 'ready'" size="sm" class="max-sm:h-11 max-sm:w-full" data-pre-border-edit @click="editOpen = true">
        <template #icon><PhPencilSimple :size="14" aria-hidden="true" /></template>
        {{ d?.started ? t('preBorder.edit') : t('preBorder.start') }}
      </ZButton>
    </div>

    <div v-if="state === 'loading'" class="flex flex-col gap-2" aria-busy="true"><ZSkeleton v-for="i in 3" :key="i" height="16px" /></div>
    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-x-3 gap-y-2" data-pre-border-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('preBorder.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-pre-border-retry @click="emit('retry')">{{ t('preBorder.retry') }}</ZButton>
    </div>
    <template v-else-if="d">
      <p class="m-0 mb-2 text-xs text-ink-3">{{ client ? t('preBorder.hintClient') : t('preBorder.hintStaff') }}</p>

      <!-- Чего не хватает до прибытия: клиенту — его ход, сотруднику — подсказка -->
      <p v-if="missing.length" class="m-0 mb-2 rounded-row bg-gold-soft px-3 py-2 text-sm text-ink" data-pre-border-missing>
        <b class="font-semibold">{{ client ? t('client.ask.eyebrow') : t('preBorder.missingStaff') }}:</b>
        {{ t('client.ask.preBorder.text', { list: missingText(missing, t) }) }}
      </p>

      <div :class="cn('grid grid-cols-1 gap-x-6 gap-y-3', !compact && 'lg:grid-cols-2')">
        <!-- 1. Оплата поставщику -->
        <div :class="block" data-pb-block="pay">
          <h3 :class="h3">{{ t('preBorder.sub.pay') }}</h3>
          <ul v-if="d.payments.length" role="list" class="m-0 flex list-none flex-col gap-0.5 p-0">
            <li v-for="p in d.payments" :key="p.id" :class="line" data-pb-paid>
              {{ p.contractNumber }} · {{ dayMonth(p.paidOn) }} · <span class="tabular-nums">{{ money(p.amount, p.currency) }}</span>
              <span class="text-ink-3"> · {{ p.supplierName }}</span>
            </li>
          </ul>
          <p v-else-if="d.supplierPaymentDeferred" :class="line">{{ t('preBorder.deferred') }}</p>
          <p v-else :class="empty">{{ t('preBorder.notFilled') }}</p>
        </div>

        <!-- 2. Готовность и погрузка -->
        <div :class="block" data-pb-block="load">
          <h3 :class="h3">{{ t('preBorder.sub.load') }}</h3>
          <p v-if="loadingLine" :class="line" data-pb-loading>{{ loadingLine }}</p>
          <p v-else :class="empty">{{ t('preBorder.notFilled') }}</p>
          <p v-if="d.sealNumbers" :class="cn(line, 'whitespace-pre-line')" data-pb-seals><span class="text-ink-3">{{ t('preBorder.seals') }}:</span> {{ d.sealNumbers }}</p>

          <!-- Фото погрузки -->
          <div class="mt-1 flex flex-col gap-1" data-pb-photos>
            <span class="text-xs text-muted">{{ t('preBorder.photos.title') }} · {{ d.photos.length }}</span>
            <ul v-if="d.photos.length" role="list" class="m-0 flex list-none flex-col p-0">
              <li v-for="p in d.photos" :key="p.id" class="flex min-w-0 items-center gap-1" data-pb-photo>
                <button type="button" :class="cn(linkBtn, 'min-w-0 font-normal')" @click="downloadPhoto(p.id, p.fileName)">
                  <PhDownloadSimple :size="14" aria-hidden="true" /><span class="truncate">{{ p.fileName }}</span>
                </button>
                <button v-if="p.canDelete" type="button" :class="cn(iconBtn, 'hover:text-danger')" :aria-label="t('preBorder.photos.delete', { name: p.fileName })" data-pb-photo-delete @click="deletePhoto(p.id, p.fileName)">
                  <PhTrash :size="15" aria-hidden="true" />
                </button>
              </li>
            </ul>
            <ZUpload
              v-if="canEdit"
              accept=".jpg,.jpeg,.png"
              convert-heic
              multiple
              :max-size-mb="25"
              :loading="photoBusy"
              button-size="sm"
              class="max-sm:w-full"
              data-pb-photo-upload
              @select="uploadPhotos"
            >{{ t('preBorder.photos.add') }}</ZUpload>
            <span v-if="photoProgress" class="text-xs tabular-nums text-muted" aria-live="polite" data-pb-photo-progress>
              {{ t('preBorder.photos.progress', { done: photoProgress.done, total: photoProgress.total }) }}
            </span>
          </div>

          <!-- Серийные номера / IMEI -->
          <div class="mt-1 flex flex-col gap-1" data-pb-serials>
            <span class="text-xs text-muted">{{ t('preBorder.serials.title') }}</span>
            <p v-if="d.serialCount" :class="line" data-pb-serial-count>
              {{ t('preBorder.serials.count', { n: d.serialCount, imei: d.imeiCount }) }}
            </p>
            <p v-else :class="empty">{{ t('preBorder.serials.none') }}</p>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button v-if="d.serialCount" type="button" :class="linkBtn" data-pb-serials-list @click="openList">{{ t('preBorder.serials.show') }}</button>
              <button v-if="canEdit" type="button" :class="linkBtn" data-pb-serials-upload @click="serialsOpen = true">{{ t('preBorder.serials.upload') }}</button>
              <button v-if="canEdit && d.serialCount" type="button" :class="cn(linkBtn, 'text-tone-danger-fg')" data-pb-serials-clear @click="clearSerials">{{ t('preBorder.serials.clear') }}</button>
            </div>
          </div>
        </div>

        <!-- 3. В пути -->
        <div :class="block" data-pb-block="transit">
          <h3 :class="h3">{{ t('preBorder.sub.transit') }}</h3>
          <p :class="line" data-pb-carrier-name><span class="text-ink-3">{{ t('preBorder.carrier') }}:</span> {{ d.carrierName || '—' }}</p>
          <p :class="line" data-pb-transport><span class="text-ink-3">{{ t('preBorder.transport') }}:</span> <span class="font-mono text-[13px]">{{ transportLine || '—' }}</span></p>
          <p :class="line" data-pb-eta><span class="text-ink-3">{{ t('preBorder.eta') }}:</span> {{ d.expectedBorderDate ? dayMonth(d.expectedBorderDate) : '—' }}</p>
          <div class="mt-1 flex flex-col gap-1" data-pb-marks>
            <span class="text-xs text-muted">{{ t('preBorder.marks.title') }}</span>
            <p v-if="!d.marks.length" :class="empty">{{ t('preBorder.marks.none') }}</p>
            <ol v-else role="list" class="m-0 flex list-none flex-col gap-1 p-0">
              <li v-for="m in d.marks" :key="m.id" class="flex min-w-0 items-start gap-2" data-pb-mark>
                <PhMapPin :size="15" class="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
                <span class="min-w-0 flex-1 text-sm text-ink [overflow-wrap:anywhere]">
                  <b class="font-semibold">{{ m.place }}</b> <span class="text-xs tabular-nums text-muted">{{ stamp(m.atUtc) }}</span>
                  <span v-if="!m.byClient" class="text-xs text-muted"> · AQNIET</span>
                  <span v-if="m.comment" class="block text-xs text-ink-2">{{ m.comment }}</span>
                </span>
                <button v-if="m.canDelete" type="button" :class="cn(iconBtn, 'hover:text-danger')" :aria-label="t('preBorder.marks.delete', { place: m.place })" data-pb-mark-delete @click="deleteMark(m.id, m.place)">
                  <PhTrash :size="15" aria-hidden="true" />
                </button>
              </li>
            </ol>
            <button v-if="canEdit" type="button" :class="cn(linkBtn, 'self-start')" data-pb-mark-add @click="openMark">{{ t('preBorder.marks.add') }}</button>
          </div>
        </div>

        <!-- 4. Прибытие на границу -->
        <div :class="block" data-pb-block="arrival">
          <h3 :class="h3">{{ t('preBorder.sub.arrival') }}</h3>
          <p v-if="d.borderArrivedAtUtc" :class="line" data-pb-arrived>
            {{ t('preBorder.arrivedAt', { when: stamp(d.borderArrivedAtUtc) }) }}<template v-if="d.borderArrivalPost"> · {{ d.borderArrivalPost }}</template>
          </p>
          <p v-else-if="d.status >= 2 && d.status !== 9" :class="line">{{ t('preBorder.sub.done') }}</p>
          <p v-else :class="empty">{{ t('preBorder.arrivalHint') }}</p>
        </div>
      </div>
    </template>

    <PreBorderModal v-model:open="editOpen" :case-id="caseId" :data="d" @saved="emit('changed', $event)" />
    <SerialsModal v-model:open="serialsOpen" :case-id="caseId" :existing="d?.serialCount ?? 0" @saved="onSerialsSaved" />

    <ZModal v-model:open="listOpen" :title="t('preBorder.serials.title')" :footer="null" :width="520" data-serials-list>
      <div class="pb-2">
        <div v-if="serialsBusy" class="flex flex-col gap-2" aria-busy="true"><ZSkeleton v-for="i in 4" :key="i" height="14px" /></div>
        <template v-else>
          <ol class="m-0 grid max-h-[55vh] list-none grid-cols-1 gap-x-4 gap-y-0.5 overflow-auto p-0 font-mono text-[13px] text-ink sm:grid-cols-2">
            <li v-for="s in serials.slice(0, LIST_SHOW)" :key="s.value" class="[overflow-wrap:anywhere]">
              {{ s.value }}<span v-if="s.kind === 'imei'" class="font-sans text-xs text-muted"> · IMEI</span>
            </li>
          </ol>
          <p v-if="serials.length > LIST_SHOW" class="m-0 mt-2 text-xs text-muted">{{ t('preBorder.serials.more', { n: serials.length - LIST_SHOW }) }}</p>
        </template>
      </div>
    </ZModal>

    <ZModal
      v-model:open="markOpen"
      :title="t('preBorder.marks.addTitle')"
      :ok-text="t('preBorder.save')"
      :cancel-text="t('preBorder.cancel')"
      :confirm-loading="markBusy"
      :width="480"
      data-mark-modal
      @ok="saveMark"
    >
      <form class="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2" novalidate @submit.prevent="saveMark">
        <ZField :label="t('preBorder.marks.date')" :error="markErrors.atUtc">
          <ZDate v-model:value="mark.date" class="max-sm:h-11" data-mark-date />
        </ZField>
        <ZField :label="t('preBorder.marks.time')">
          <ZInput v-model:value="mark.time" type="time" class="max-sm:h-11" data-mark-time />
        </ZField>
        <ZField :label="t('preBorder.marks.place')" :error="markErrors.place" required class="sm:col-span-2">
          <ZInput v-model:value="mark.place" :maxlength="300" :placeholder="t('preBorder.marks.placePh')" class="max-sm:h-11" data-mark-place />
        </ZField>
        <ZField :label="t('preBorder.marks.comment')" :error="markErrors.comment" class="sm:col-span-2">
          <ZInput v-model:value="mark.comment" :maxlength="1000" class="max-sm:h-11" data-mark-comment />
        </ZField>
      </form>
    </ZModal>
  </section>
</template>
