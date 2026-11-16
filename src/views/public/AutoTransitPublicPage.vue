<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhFileText, PhWarningCircle } from '@phosphor-icons/vue'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import LangSegment from '@/components/auth/LangSegment.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { setLocale, type AppLocale } from '@/i18n'
import { publicFileUrl, publicGet, publicImportInterest, publicZipUrl, type PublicTruckView } from '@/api/autoTransit'
import StageBar from '@/views/broker/autoTransit/StageBar.vue'
import type { StageCell } from '@/views/broker/autoTransit/autoTransit'
import { pickLocale, relativeTime } from './publicTime'

// Страница грузополучателя «Авто-транзита» (/t/:token): открывается по ссылке брокера на телефоне, без входа и вне
// оболочки. Показывает этап границы, документы получателя и просьбу оформить импорт. Токен — только в адресах API.
const { t, locale } = useI18n()
const route = useRoute()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.autoTransit.public.${key}`, p ?? {})
const token = computed(() => String(route.params.token ?? ''))

const REFRESH_MS = 60_000
const TICK_MS = 30_000
const MIN_CONTACT = 5
const STAGES = [1, 2, 3, 4, 5, 6, 7]

type PageState = 'loading' | 'ok' | 'notFound' | 'tooMany' | 'network'
const state = ref<PageState>('loading')
const view = ref<PublicTruckView | null>(null)
const now = ref(new Date())
let lastOk = 0
let requestId = 0

const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status

async function load(initial: boolean) {
  const id = ++requestId
  if (initial) state.value = 'loading'
  try {
    const v = await publicGet(token.value)
    if (id !== requestId) return
    view.value = v
    state.value = 'ok'
    now.value = new Date()
    lastOk = Date.now()
  } catch (e) {
    if (id !== requestId) return
    const status = statusOf(e)
    if (status === 404) {
      // Ссылку отозвали или срок вышел: данных на экране не оставляем.
      view.value = null
      state.value = 'notFound'
    } else if (initial || !view.value) {
      state.value = status === 429 ? 'tooMany' : 'network'
    } // сбой фонового обновления — молча оставляем последние данные
  }
}

// --- таймеры: обновление раз в минуту и «часы» для подписи, только пока вкладка видна ---
let refreshTimer: ReturnType<typeof setInterval> | undefined
let tickTimer: ReturnType<typeof setInterval> | undefined
const visible = () => document.visibilityState !== 'hidden'
function stopTimers() {
  if (refreshTimer) clearInterval(refreshTimer)
  if (tickTimer) clearInterval(tickTimer)
  refreshTimer = tickTimer = undefined
}
function startTimers() {
  stopTimers()
  refreshTimer = setInterval(() => { if (state.value === 'ok') void load(false) }, REFRESH_MS)
  tickTimer = setInterval(() => { now.value = new Date() }, TICK_MS)
}
function onVisibility() {
  if (!visible()) { stopTimers(); return }
  now.value = new Date()
  if (state.value === 'ok' && Date.now() - lastOk >= REFRESH_MS) void load(false)
  startTimers()
}

// --- язык, заголовок вкладки, noindex ---
let metaEl: HTMLMetaElement | null = null
let prevTitle = ''
const setTitle = () => { document.title = tx('docTitle') }
watch(locale, setTitle)

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
  if (visible()) startTimers()
})
onBeforeUnmount(() => {
  requestId++ // запоздавший ответ уже ничего не меняет
  stopTimers()
  document.removeEventListener('visibilitychange', onVisibility)
  metaEl?.remove()
  document.title = prevTitle
})

// --- представление ---
const stage = computed(() => (view.value?.released ? null : view.value?.currentStage ?? null))
const headline = computed(() => (view.value?.released ? tx('headline.released') : stage.value ? tx(`headline.s${stage.value}`) : tx('title')))
const recipientLine = computed(() => {
  const v = view.value
  if (!v) return ''
  return [v.recipientName?.trim(), v.invoiceNumber?.trim() ? tx('invoice', { n: v.invoiceNumber.trim() }) : ''].filter(Boolean).join(' · ')
})
const steps = computed<StageCell[]>(() => STAGES.map((n) => (view.value?.released ? 'done' : stage.value == null ? 'todo' : n < stage.value ? 'done' : n === stage.value ? 'current' : 'todo')))
const barLabel = computed(() => (view.value?.released ? tx('barLabelDone') : stage.value ? tx('barLabel', { n: stage.value }) : ''))
const when = computed(() => (view.value ? relativeTime(view.value.updatedAtUtc, now.value, t as never, locale.value as AppLocale) : ''))
const stageLine = computed(() => (view.value?.released ? tx('releasedLine', { when: when.value }) : tx('stageLine', { n: stage.value ?? 1, when: when.value })))

const LABELLED = ['invoice', 'packingList', 'cmr', 'td', 'warehouseReceipt']
const files = computed(() => view.value?.files ?? [])
const docLabel = (f: { kind: string; fileName: string }) => (LABELLED.includes(f.kind) ? tx(`docs.kind.${f.kind}`) : f.fileName)
const hasKind = (k: string) => files.value.some((f) => f.kind === k)
const later = computed(() => [
  ...(hasKind('td') ? [] : [{ kind: 'td', label: tx('docs.kind.td'), note: tx('docs.laterTd') }]),
  ...(hasKind('warehouseReceipt') ? [] : [{ kind: 'warehouseReceipt', label: tx('docs.kind.warehouseReceipt'), note: tx('docs.laterWarehouse') }]),
])

// --- «Оформить импорт» ---
// Ключ в sessionStorage — не сам токен, а его короткий хеш: токен остаётся только в адресах API.
const keyOf = (tok: string) => {
  let h = 5381
  for (let i = 0; i < tok.length; i++) h = ((h * 33) ^ tok.charCodeAt(i)) >>> 0
  return `autoTransitImport:${h.toString(36)}`
}
const readThanks = () => { try { return sessionStorage.getItem(keyOf(token.value)) === '1' } catch { return false } }
const thanks = ref(readThanks())
const contact = ref('')
const contactError = ref('')
const submitting = ref(false)
const contactOk = computed(() => contact.value.trim().length >= MIN_CONTACT)

const serverContactError = (e: unknown): string | null => {
  const data = (e as { response?: { status?: number; data?: { errors?: { contact?: unknown } } } })?.response
  if (data?.status !== 400) return null
  const first = Array.isArray(data.data?.errors?.contact) ? data.data!.errors!.contact[0] : null
  return typeof first === 'string' && first.trim() ? first : tx('import.invalid')
}

async function submitInterest() {
  if (submitting.value || !contactOk.value) return
  submitting.value = true
  contactError.value = ''
  try {
    await publicImportInterest(token.value, contact.value)
    thanks.value = true
    try { sessionStorage.setItem(keyOf(token.value), '1') } catch { /* не критично */ }
  } catch (e) {
    contactError.value = serverContactError(e) ?? (statusOf(e) === 429 ? tx('error.tooMany') : tx('error.network'))
  } finally {
    submitting.value = false
  }
}
const onContactInput = () => { contactError.value = '' }
</script>

<template>
  <div class="min-h-dvh bg-canvas px-4 py-5 sm:py-8" data-auto-transit-public>
    <div class="mx-auto flex w-full max-w-[480px] min-w-0 flex-col gap-4">
      <header class="flex items-center justify-between gap-2">
        <ZirconLogo size="md" />
        <LangSegment />
      </header>

      <div v-if="state === 'loading'" class="flex flex-col gap-3" data-state="loading">
        <span class="sr-only" role="status">{{ tx('loading') }}</span>
        <ZSkeleton width="55%" height="16px" />
        <ZSkeleton width="90%" height="26px" />
        <ZSkeleton height="6px" />
        <ZSkeleton height="120px" />
      </div>

      <section v-else-if="state === 'notFound'" class="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface p-5" data-state="notFound">
        <PhWarningCircle :size="28" class="text-tone-danger-fg" aria-hidden="true" />
        <h1 class="m-0 text-lg leading-6 font-semibold text-ink">{{ tx('error.notFound') }}</h1>
      </section>

      <section v-else-if="state === 'tooMany' || state === 'network'" class="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface p-5" :data-state="state">
        <PhWarningCircle :size="28" class="text-tone-danger-fg" aria-hidden="true" />
        <h1 class="m-0 text-lg leading-6 font-semibold text-ink">{{ state === 'tooMany' ? tx('error.tooMany') : tx('error.network') }}</h1>
        <ZButton size="lg" class="h-11" @click="load(true)">{{ tx('error.retry') }}</ZButton>
      </section>

      <template v-else-if="view">
        <div class="flex flex-col gap-1">
          <p v-if="recipientLine" class="m-0 text-sm break-words text-ink-3" data-recipient-line>{{ recipientLine }}</p>
          <h1 class="m-0 text-xl leading-7 font-semibold text-ink">{{ headline }}</h1>
          <p v-if="view.tdNumber" class="m-0 text-sm break-words text-ink-2" data-td-line>{{ tx('tdLine', { n: view.tdNumber }) }}</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <StageBar :steps="steps" :label="barLabel" />
          <p class="m-0 text-[13px] text-ink-3" data-stage-line>{{ stageLine }}</p>
        </div>

        <section class="flex flex-col rounded-panel border border-line bg-surface px-4 py-3" aria-labelledby="at-docs-title">
          <h2 id="at-docs-title" class="m-0 mb-1 text-base font-semibold text-ink">{{ tx('docs.title') }}</h2>
          <p v-if="!files.length" class="m-0 py-2 text-sm text-ink-2">{{ tx('docs.empty') }}</p>
          <ul class="m-0 flex list-none flex-col p-0">
            <li v-for="f in files" :key="f.id" class="flex min-h-11 items-center gap-3 border-t border-line first:border-t-0" data-doc-row>
              <PhFileText :size="20" class="shrink-0 text-ink-3" aria-hidden="true" />
              <span class="flex min-w-0 flex-1 flex-col py-1.5">
                <span class="truncate text-sm text-ink">{{ docLabel(f) }}</span>
                <span v-if="LABELLED.includes(f.kind)" class="truncate text-xs text-ink-3">{{ f.fileName }}</span>
              </span>
              <a
                :href="publicFileUrl(token, f.id)"
                download
                rel="noopener"
                :aria-label="tx('docs.downloadLabel', { name: f.fileName })"
                class="inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus"
              >{{ tx('docs.download') }}</a>
            </li>
            <li v-for="l in later" :key="l.kind" class="flex min-h-11 items-center gap-3 border-t border-line first:border-t-0" :data-doc-later="l.kind">
              <PhFileText :size="20" class="shrink-0 text-muted" aria-hidden="true" />
              <span class="min-w-0 flex-1 py-1.5 text-sm text-muted">{{ l.label }} — {{ l.note }}</span>
            </li>
          </ul>
        </section>

        <a
          v-if="files.length"
          :href="publicZipUrl(token)"
          download
          rel="noopener"
          data-download-all
          class="flex h-11 items-center justify-center rounded-field border border-line-strong bg-surface px-4 text-center text-[15px] font-semibold text-ink outline-hidden hover:bg-sunken focus-visible:shadow-focus"
        >{{ tx('downloadAll') }}</a>

        <section class="flex flex-col gap-3 rounded-panel border border-line bg-tone-info-bg p-4" data-import>
          <template v-if="thanks">
            <p class="m-0 text-base font-semibold text-ink" role="status">{{ tx('import.thanks') }}</p>
          </template>
          <form v-else class="flex flex-col gap-3" novalidate @submit.prevent="submitInterest">
            <div>
              <h2 class="m-0 text-base font-semibold text-ink">{{ tx('import.title') }}</h2>
              <p class="m-0 mt-1 text-sm text-ink-2">{{ tx('import.pitch') }}</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="at-contact" class="text-[13px] font-medium text-ink-2">{{ tx('import.label') }}</label>
              <ZInput
                id="at-contact"
                v-model:value="contact"
                size="lg"
                class="h-11 w-full"
                :maxlength="100"
                autocomplete="tel"
                inputmode="text"
                :invalid="!!contactError"
                :aria-describedby="contactError ? 'at-contact-error' : undefined"
                @change="onContactInput"
              />
              <p v-if="contactError" id="at-contact-error" class="m-0 text-[13px] text-tone-danger-fg" role="alert" data-import-error>{{ contactError }}</p>
            </div>
            <ZButton html-type="submit" variant="primary" size="lg" block class="h-11" :disabled="!contactOk" :loading="submitting">{{ tx('import.submit') }}</ZButton>
          </form>
        </section>
      </template>
    </div>
  </div>
</template>
