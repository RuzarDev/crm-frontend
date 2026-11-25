<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhWarningCircle } from '@phosphor-icons/vue'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import LangSegment from '@/components/auth/LangSegment.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { setLocale, type AppLocale } from '@/i18n'
import { UPLOAD_MAX_BYTES, publicUploadFile, publicUploadGet, type FileKind, type PublicUploadView } from '@/api/autoTransit'
import { message } from '@/ui/message'
import UploadButtons from '@/views/broker/autoTransit/truck/UploadButtons.vue'
import UploadQueueList from '@/views/broker/autoTransit/new/UploadQueueList.vue'
import { useUploadQueue, type QueueFailure } from '@/views/broker/autoTransit/new/useUploadQueue'
import { dateText, ddmm, hhmm } from '@/views/broker/autoTransit/truck/truckView'
import { pickLocale } from './publicTime'

// Ссылка загрузки «Авто-транзита» (/u/:token, очередь 3, спека 2026-11-25, 5.1): клиент присылает документы груза
// (uploadCargo — CMR, инвойс, упаковочный), водитель или перевозчик — документы машины (uploadVehicle — паспорт,
// техпаспорта). Без входа, вне оболочки, с телефона: камера и файлы, очередь загрузки с повтором (та же, что в карточке
// машины), видно, что уже загружено и что вернули с причиной. Всё недействительное — пустой 404 → «Ссылка недействительна».
// Частота — 20 запросов в минуту: страница не опрашивает сервер сама, только после загрузки и при возврате на вкладку;
// 429 при загрузке очередь пережидает сама (retryOn429).
const { t, te, locale } = useI18n()
const route = useRoute()
const L = 'broker.autoTransit.uploadLink'
const tx = (key: string, p?: Record<string, unknown>) => t(`${L}.${key}`, p ?? {})
const token = computed(() => String(route.params.token ?? ''))

type PageState = 'loading' | 'ok' | 'notFound' | 'tooMany' | 'network'
const state = ref<PageState>('loading')
const view = ref<PublicUploadView | null>(null)
const kind = ref<FileKind | null>(null)
let requestId = 0
let lastOk = 0
const REFRESH_MIN_MS = 60_000

const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status

/** Вид по умолчанию: первый обязательный незагруженный, иначе прежний выбор, иначе первый. */
const defaultKind = (v: PublicUploadView): FileKind | null => {
  if (kind.value && v.kinds.some((k) => k.kind === kind.value)) return kind.value
  return (v.kinds.find((k) => k.required && !k.uploaded) ?? v.kinds[0])?.kind ?? null
}

async function load(initial: boolean) {
  const id = ++requestId
  if (initial) state.value = 'loading'
  try {
    const v = await publicUploadGet(token.value)
    if (id !== requestId) return
    view.value = v
    kind.value = initial ? (v.kinds.find((k) => k.required && !k.uploaded) ?? v.kinds[0])?.kind ?? null : defaultKind(v)
    state.value = 'ok'
    lastOk = Date.now()
  } catch (e) {
    if (id !== requestId) return
    const status = statusOf(e)
    if (status === 404) {
      view.value = null
      state.value = 'notFound'
    } else if (initial || !view.value) {
      state.value = status === 429 ? 'tooMany' : 'network'
    } // сбой фонового перечитывания — оставляем то, что на экране
  }
}

// ---- Очередь загрузки ----
let invalid = false
const classify = (status: number | undefined, data: unknown): QueueFailure | null => {
  if (status === 404) {
    invalid = true
    return { key: `${L}.invalid`, retryable: false, stop: true }
  }
  if (status === 409) {
    const code = String((data as { code?: unknown } | undefined)?.code ?? '')
    return code === 'upload_limit' ? { key: `${L}.limit`, retryable: false, stop: true } : { key: `${L}.failed` }
  }
  if (status === 413) return { key: `${L}.tooBig`, text: tx('tooBigMb', { mb: Math.round(UPLOAD_MAX_BYTES / 1024 / 1024) }), retryable: false }
  return null
}
const queue = useUploadQueue(() => token.value || null, {
  send: (tok, file, opts, onProgress) => publicUploadFile(tok, file, opts.kind ?? 'other', onProgress),
  classify,
  retryOn429: true,
  onIdle: () => {
    if (invalid) {
      view.value = null
      state.value = 'notFound'
      return
    }
    queue.clearDone()
    void load(false)
  },
})
const retryable = computed(() => queue.items.value.filter((i) => i.state === 'failed' && i.retryable).length)

const onFiles = (files: File[]) => {
  if (!kind.value) return
  for (const r of queue.add(files, { kind: kind.value })) {
    message.error(r.reason === 'tooBig'
      ? tx('tooBigName', { name: r.name, mb: Math.round(UPLOAD_MAX_BYTES / 1024 / 1024) })
      : t('broker.autoTransit.upload.badType', { name: r.name }))
  }
  if (queue.pending.value) void queue.start()
}

// ---- Подписи ----
/** Подпись вида — по коду на языке страницы; «прочее» у машины — своё; незнакомый код — подпись сервера. */
const kindLabel = (k: string, serverLabel?: string) => {
  const special = view.value?.purpose === 'uploadVehicle' && k === 'other' ? 'otherVehicle' : k
  const key = `${L}.kinds.${special}`
  return te(key) ? t(key) : serverLabel || k
}
type KindState = 'uploaded' | 'returned' | 'needed' | 'optional'
const kinds = computed(() => (view.value?.kinds ?? []).map((k) => {
  const returned = !k.uploaded && (view.value?.files ?? []).some((f) => f.kind === k.kind && f.returned)
  const st: KindState = k.uploaded ? 'uploaded' : returned ? 'returned' : k.required ? 'needed' : 'optional'
  return { ...k, text: kindLabel(k.kind, k.label), state: st }
}))
const selectedLabel = computed(() => kinds.value.find((k) => k.kind === kind.value)?.text ?? '')
const files = computed(() => [...(view.value?.files ?? [])].reverse().map((f) => ({
  ...f,
  kindText: kindLabel(f.kind, view.value?.kinds.find((k) => k.kind === f.kind)?.label),
  at: f.uploadedAtUtc ? `${ddmm(f.uploadedAtUtc)} ${hhmm(f.uploadedAtUtc)}` : '',
})))
const meta = computed(() => {
  const v = view.value
  if (!v) return ''
  const who = v.purpose === 'uploadCargo'
    ? [v.partyNumber != null ? tx('party', { n: v.partyNumber }) : '', v.recipientName?.trim() ?? ''].filter(Boolean).join(' · ')
    : tx('vehicleDocs')
  return [who, tx('expires', { date: dateText(v.expiresAtUtc) })].filter(Boolean).join(' · ')
})
const title = computed(() => (view.value ? tx(view.value.purpose === 'uploadCargo' ? 'titleCargo' : 'titleVehicle', { plate: view.value.truckPlate }) : ''))

// ---- Язык, заголовок вкладки, noindex, перечитывание при возврате на вкладку ----
let metaEl: HTMLMetaElement | null = null
let prevTitle = ''
const setTitle = () => { document.title = tx('docTitle') }
watch(locale, setTitle)
function onVisibility() {
  if (document.visibilityState === 'hidden' || state.value !== 'ok' || queue.running.value) return
  if (Date.now() - lastOk >= REFRESH_MIN_MS) void load(false)
}
onMounted(() => {
  let stored: string | null = null
  try { stored = localStorage.getItem('appLocale') } catch { /* private mode */ }
  const picked: AppLocale = pickLocale(stored, navigator.languages ?? [navigator.language])
  if (picked !== locale.value) void setLocale(picked)
  prevTitle = document.title
  setTitle()
  metaEl = document.createElement('meta')
  metaEl.name = 'robots'
  metaEl.content = 'noindex'
  document.head.appendChild(metaEl)
  document.addEventListener('visibilitychange', onVisibility)
  void load(true)
})
onBeforeUnmount(() => {
  requestId++
  document.removeEventListener('visibilitychange', onVisibility)
  metaEl?.remove()
  document.title = prevTitle
})

const STATE_CLASS: Record<KindState, string> = {
  uploaded: 'text-tone-done-fg',
  returned: 'text-tone-danger-fg',
  needed: 'text-gold-ink',
  optional: 'text-muted',
}
</script>

<template>
  <div class="min-h-dvh bg-canvas px-4 py-5 sm:py-8" data-auto-transit-upload>
    <div class="mx-auto flex w-full max-w-[480px] min-w-0 flex-col gap-4">
      <header class="flex items-center justify-between gap-2">
        <ZirconLogo size="md" />
        <LangSegment />
      </header>

      <div v-if="state === 'loading'" class="flex flex-col gap-3" data-state="loading">
        <span class="sr-only" role="status">{{ tx('loading') }}</span>
        <ZSkeleton width="55%" height="16px" />
        <ZSkeleton width="90%" height="26px" />
        <ZSkeleton height="160px" />
      </div>

      <section v-else-if="state === 'notFound'" class="flex flex-col items-start gap-2 rounded-panel border border-line bg-surface p-5" data-state="notFound">
        <PhWarningCircle :size="28" class="text-tone-danger-fg" aria-hidden="true" />
        <h1 class="m-0 text-lg leading-6 font-semibold text-ink">{{ tx('notFound') }}</h1>
        <p class="m-0 text-sm text-ink-2">{{ tx('notFoundHint') }}</p>
      </section>

      <section v-else-if="state === 'tooMany' || state === 'network'" class="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface p-5" :data-state="state">
        <PhWarningCircle :size="28" class="text-tone-danger-fg" aria-hidden="true" />
        <h1 class="m-0 text-lg leading-6 font-semibold text-ink">{{ state === 'tooMany' ? tx('tooMany') : tx('network') }}</h1>
        <ZButton size="lg" class="h-11" @click="load(true)">{{ tx('retry') }}</ZButton>
      </section>

      <template v-else-if="view">
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="m-0 text-xl leading-7 font-semibold [overflow-wrap:anywhere] text-ink">{{ title }}</h1>
          <p class="m-0 text-sm [overflow-wrap:anywhere] text-ink-3" data-upload-meta>{{ meta }}</p>
        </div>

        <section class="flex min-w-0 flex-col gap-2 rounded-panel border border-line bg-surface p-4" aria-labelledby="up-kinds-title">
          <h2 id="up-kinds-title" class="m-0 text-base font-semibold text-ink">{{ tx('kindsTitle') }}</h2>
          <p class="m-0 text-sm text-ink-2">{{ tx('kindsHint') }}</p>
          <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
            <legend class="sr-only">{{ tx('kindsTitle') }}</legend>
            <label
              v-for="k in kinds"
              :key="k.kind"
              class="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-row border px-3 py-2 has-[:focus-visible]:shadow-focus"
              :class="kind === k.kind ? 'border-navy bg-sunken' : 'border-line'"
              :data-kind="k.kind"
              :data-kind-state="k.state"
            >
              <input v-model="kind" type="radio" name="upload-kind" :value="k.kind" class="shrink-0 accent-navy">
              <span class="min-w-0 flex-1 text-sm text-ink [overflow-wrap:anywhere]">{{ k.text }}</span>
              <span class="inline-flex shrink-0 items-center gap-1 text-xs font-semibold" :class="STATE_CLASS[k.state]">
                <PhCheckCircle v-if="k.state === 'uploaded'" :size="16" weight="fill" aria-hidden="true" />
                {{ tx(`state.${k.state}`) }}
              </span>
            </label>
          </fieldset>
          <p v-if="selectedLabel" class="m-0 mt-1 text-sm text-ink-2" data-upload-selected>{{ tx('selected', { kind: selectedLabel }) }}</p>
          <UploadButtons :disabled="!kind" :size-check-off="true" @files="onFiles" />
          <UploadQueueList :items="queue.items.value" can-remove @retry="queue.retry($event)" @remove="queue.remove($event)" />
          <ZButton v-if="retryable > 1 && !queue.running.value" size="sm" class="self-start max-sm:h-11" data-upload-retry-all @click="queue.retryAll()">
            {{ t('broker.autoTransit.upload.retryAll', { n: retryable }) }}
          </ZButton>
        </section>

        <section class="flex min-w-0 flex-col rounded-panel border border-line bg-surface px-4 py-3" aria-labelledby="up-sent-title">
          <h2 id="up-sent-title" class="m-0 mb-1 text-base font-semibold text-ink">{{ tx('sentTitle') }}</h2>
          <p v-if="!files.length" class="m-0 py-2 text-sm text-ink-2" data-sent-empty>{{ tx('sentEmpty') }}</p>
          <ul v-else role="list" class="m-0 flex list-none flex-col p-0">
            <li
              v-for="f in files"
              :key="f.id"
              class="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 border-t border-line py-2 first:border-t-0"
              :data-sent-file="f.id"
              :data-returned="f.returned ? 'true' : 'false'"
            >
              <span class="flex min-w-0 items-baseline gap-2">
                <span class="min-w-0 truncate text-sm" :class="f.returned ? 'text-muted line-through' : 'text-ink'" :title="f.name">{{ f.name }}</span>
                <span class="shrink-0 text-xs text-muted">{{ f.kindText }}<template v-if="f.at"> · {{ f.at }}</template></span>
              </span>
              <span v-if="f.returned" class="text-xs [overflow-wrap:anywhere] text-tone-danger-fg" role="note">
                {{ tx('returned', { reason: f.returnReason || tx('noReason') }) }} {{ tx('returnedHint') }}
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
