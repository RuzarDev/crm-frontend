<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut, PhCheckCircle, PhDeviceMobile, PhWarningCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import { import40ContractApi } from '@/api/import40Contract'
import { extractServerText } from '@/api/client'

// Подпись документа через eGov (Sigex): сессия → QR и ссылки в приложения → «Я подписал — проверить»
// → успех или ошибка с «Попробовать снова». side — чья подпись: клиента (кабинет клиента; сотрудник-администратор
// за клиента) или AQNIET (сотрудник: администратор или РОП). Запросы silent: ошибки показываются в самом окне.
// Ответы запросов, начатых до закрытия/повтора, отбрасываются.
const props = withDefaults(defineProps<{
  open: boolean
  clientId: string
  docId: string | null
  side?: 'client' | 'provider'
}>(), { side: 'client' })
const emit = defineEmits<{ 'update:open': [open: boolean]; signed: [] }>()
const { t } = useI18n()

type Step = 'loading' | 'qr' | 'success' | 'error'
const step = ref<Step>('loading')
const qrCode = ref('')
const mobileLink = ref('')
const businessLink = ref('')
const qrId = ref('')
const polling = ref(false)
const pending = ref(false)
const errorText = ref('')
// C-18 (30.10.2026): QR живёт ограниченное время (expireAt из ответа Sigex). После него «Я подписал — проверить» вечно
// отвечало «подпись ещё не получена» — теперь окно говорит, что QR устарел, и предлагает новый.
const expired = ref(false)
let expireTimer: ReturnType<typeof setTimeout> | undefined
const clearExpireTimer = () => {
  if (expireTimer !== undefined) clearTimeout(expireTimer)
  expireTimer = undefined
}
/** expireAt Sigex — миллисекунды Unix; на случай секунд — переводим. 0/нет — срок неизвестен. */
const expireMs = (v: number | undefined | null): number | null => (!v || v <= 0 ? null : v < 1e12 ? v * 1000 : v)
let seq = 0

const serverText = (e: unknown) =>
  extractServerText((e as { response?: { data?: unknown } })?.response?.data)

async function start() {
  const my = ++seq
  step.value = 'loading'
  qrCode.value = ''
  qrId.value = ''
  pending.value = false
  expired.value = false
  clearExpireTimer()
  if (!props.docId) {
    // Нечего подписывать (документ не выбран) — сразу ошибка, а не вечная загрузка.
    errorText.value = t('client.company.sigex.startError')
    step.value = 'error'
    return
  }
  try {
    const data = await import40ContractApi.sigexStartSigningDocument(props.clientId, props.docId)
    if (my !== seq) return
    qrCode.value = data.qrCode
    mobileLink.value = data.eGovMobileLaunchLink
    businessLink.value = data.eGovBusinessLaunchLink
    qrId.value = data.qrId
    const until = expireMs(data.expireAt)
    if (until !== null) {
      const left = until - Date.now()
      if (left <= 0) expired.value = true
      else expireTimer = setTimeout(() => { if (my === seq) expired.value = true }, Math.min(left, 2_147_483_647))
    }
    step.value = 'qr'
  } catch (e) {
    if (my !== seq) return
    errorText.value = serverText(e) ?? t('client.company.sigex.startError')
    step.value = 'error'
  }
}

async function check() {
  if (!qrId.value || !props.docId || polling.value) return
  const my = seq
  polling.value = true
  pending.value = false
  try {
    const result = await import40ContractApi.sigexPollDocument(props.clientId, props.docId, qrId.value)
    if (my !== seq) return
    if (result.pending) {
      // Подписи нет, а QR уже истёк — ждать бессмысленно: «QR устарел» и «Новый QR».
      if (expired.value) return
      pending.value = true
      return
    }
    await import40ContractApi.sigexCompleteDocument(props.clientId, props.docId, qrId.value, props.side)
    // Подпись уже сохранена на сервере: даже если окно успели закрыть, экран должен перечитать документ.
    if (my !== seq) {
      emit('signed')
      return
    }
    step.value = 'success'
  } catch (e) {
    if (my !== seq) return
    errorText.value = serverText(e) ?? t('client.company.sigex.checkError')
    step.value = 'error'
  } finally {
    if (my === seq) polling.value = false
  }
}

watch(() => props.open, (v) => {
  if (v) void start()
  else {
    seq++
    polling.value = false
    clearExpireTimer()
  }
}, { immediate: true })
onBeforeUnmount(clearExpireTimer)

// Закрыли крестиком/Escape уже после успешной подписи — это тоже «подписано»: экран должен перечитать документ.
const close = () => (step.value === 'success' ? emit('signed') : emit('update:open', false))

// Ссылки в приложения — как кнопки: на телефоне по 44px и во всю ширину (QR там не отсканировать — главный путь).
const appLink = 'inline-flex h-10 items-center justify-center gap-2 rounded-row px-4 text-sm font-semibold no-underline outline-hidden transition-colors duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none max-sm:h-11 max-sm:w-full'
</script>

<template>
  <ZModal
    :open="open"
    :title="t('client.company.sigex.title')"
    :footer="false"
    :mask-closable="false"
    :width="480"
    destroy-on-close
    data-sigex-modal
    @update:open="(v: boolean) => !v && close()"
  >
    <div v-if="step === 'loading'" class="flex flex-col items-center gap-3 py-10 text-center" data-sigex-step="loading">
      <ZSpin size="lg" />
      <p class="m-0 text-sm text-ink-3">{{ t('client.company.sigex.creating') }}</p>
    </div>

    <div v-else-if="step === 'qr'" class="flex flex-col gap-4 pb-4" data-sigex-step="qr">
      <p class="m-0 text-base text-ink-2">{{ t('client.company.sigex.scan') }}</p>
      <div class="flex justify-center">
        <img
          v-if="qrCode"
          :src="`data:image/png;base64,${qrCode}`"
          :alt="t('client.company.sigex.qrAlt')"
          width="216"
          height="216"
          class="size-[216px] rounded-row border border-line bg-white p-2"
          data-sigex-qr
        />
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <a
          v-if="mobileLink"
          :href="mobileLink"
          target="_blank"
          rel="noopener"
          :class="[appLink, 'bg-sunken text-ink hover:bg-line-strong']"
          data-sigex-mobile
        >
          <PhDeviceMobile :size="17" aria-hidden="true" />{{ t('client.company.sigex.openMobile') }}
        </a>
        <a
          v-if="businessLink"
          :href="businessLink"
          target="_blank"
          rel="noopener"
          :class="[appLink, 'bg-sunken text-ink hover:bg-line-strong']"
          data-sigex-business
        >
          <PhArrowSquareOut :size="17" aria-hidden="true" />{{ t('client.company.sigex.openBusiness') }}
        </a>
      </div>
      <div class="flex flex-col items-stretch gap-2 border-0 border-t border-solid border-line pt-4">
        <p class="m-0 text-center text-sm text-ink-3">{{ t('client.company.sigex.afterSign') }}</p>
        <!-- Живая область смонтирована всегда (иначе экранный диктор может не прочитать первое сообщение), меняется только текст -->
        <p
          role="status"
          aria-live="polite"
          :class="pending || expired ? 'm-0 rounded-row bg-gold-soft px-3 py-2 text-center text-sm text-gold-ink' : 'sr-only'"
          data-sigex-pending
        >{{ expired ? t('client.company.sigex.expired') : pending ? t('client.company.sigex.notYet') : '' }}</p>
        <div class="flex flex-wrap justify-center gap-2 max-sm:flex-col">
          <ZButton
            :variant="expired ? 'secondary' : 'primary'"
            :loading="polling"
            class="h-10 px-5 max-sm:h-11 max-sm:w-full"
            data-sigex-check
            @click="check"
          >
            {{ t('client.company.sigex.check') }}
          </ZButton>
          <ZButton v-if="expired" variant="primary" class="h-10 px-5 max-sm:h-11 max-sm:w-full" data-sigex-new-qr @click="start">
            {{ t('client.company.sigex.newQr') }}
          </ZButton>
        </div>
      </div>
    </div>

    <div v-else-if="step === 'success'" class="flex flex-col items-center gap-2 py-8 text-center" data-sigex-step="success">
      <PhCheckCircle :size="48" weight="fill" class="text-tone-done-fg" aria-hidden="true" />
      <p class="m-0 text-md font-semibold text-ink">{{ t('client.company.sigex.done') }}</p>
      <p class="m-0 text-sm text-ink-3">{{ t('client.company.sigex.doneHint') }}</p>
      <ZButton variant="primary" class="mt-3 h-10 px-6 max-sm:h-11 max-sm:w-full" data-sigex-finish @click="emit('signed')">
        {{ t('client.company.sigex.finish') }}
      </ZButton>
    </div>

    <div v-else class="flex flex-col items-center gap-2 py-8 text-center" data-sigex-step="error">
      <PhWarningCircle :size="48" weight="fill" class="text-danger" aria-hidden="true" />
      <p class="m-0 text-md font-semibold text-ink">{{ t('client.company.sigex.errorTitle') }}</p>
      <p role="alert" class="m-0 max-w-[360px] text-sm text-ink-2" data-sigex-error>{{ errorText }}</p>
      <ZButton class="mt-3 h-10 px-5 max-sm:h-11 max-sm:w-full" data-sigex-retry @click="start">
        {{ t('client.company.sigex.retry') }}
      </ZButton>
    </div>
  </ZModal>
</template>
