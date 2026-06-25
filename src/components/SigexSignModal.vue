<template>
  <a-modal
    :open="open"
    title="Подписание через eGov"
    :footer="null"
    :mask-closable="false"
    width="480px"
    @cancel="$emit('cancel')"
  >
    <!-- Инициализация -->
    <div v-if="step === 'loading'" class="sigex-center">
      <a-spin size="large" />
      <p class="sigex-hint">Создаём сессию подписания…</p>
    </div>

    <!-- QR Code -->
    <div v-else-if="step === 'qr'" class="sigex-body">
      <p class="sigex-desc">
        Отсканируйте QR-код приложением <strong>eGov Mobile</strong> или перейдите
        по ссылке для подписания документа.
      </p>

      <div class="sigex-qr-wrap">
        <img
          v-if="qrCode"
          :src="`data:image/png;base64,${qrCode}`"
          alt="QR для подписи"
          class="sigex-qr"
        />
        <a-spin v-else />
      </div>

      <div class="sigex-links">
        <a
          v-if="eGovMobileLink"
          :href="eGovMobileLink"
          target="_blank"
          class="sigex-link-btn sigex-egov-mobile"
        >
          <MobileOutlined /> eGov Mobile
        </a>
        <a
          v-if="eGovBusinessLink"
          :href="eGovBusinessLink"
          target="_blank"
          class="sigex-link-btn sigex-egov-biz"
        >
          <BankOutlined /> eGov Business
        </a>
      </div>

      <a-divider />

      <div class="sigex-poll-row">
        <p class="sigex-hint">После подписания нажмите кнопку ниже.</p>
        <a-button type="primary" :loading="polling" @click="poll">
          <CheckOutlined /> Я подписал — проверить
        </a-button>
      </div>
    </div>

    <!-- Успех -->
    <div v-else-if="step === 'success'" class="sigex-center sigex-success">
      <CheckCircleOutlined class="sigex-icon-ok" />
      <h3>Документ подписан!</h3>
      <p class="sigex-hint">Подпись eGov получена и сохранена.</p>
      <a-button type="primary" @click="$emit('signed')">Готово</a-button>
    </div>

    <!-- Ошибка -->
    <div v-else-if="step === 'error'" class="sigex-center sigex-error">
      <ExclamationCircleOutlined class="sigex-icon-err" />
      <h3>Ошибка</h3>
      <p class="sigex-hint">{{ errorMsg }}</p>
      <a-button @click="start">Попробовать снова</a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  BankOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
  MobileOutlined,
} from '@ant-design/icons-vue'
import { import40ContractApi } from '@/api/import40Contract'

const props = defineProps<{
  open: boolean
  clientId: string
  side: 'client' | 'provider'
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'signed'): void
}>()

type Step = 'loading' | 'qr' | 'success' | 'error'

const step = ref<Step>('loading')
const qrCode = ref('')
const eGovMobileLink = ref('')
const eGovBusinessLink = ref('')
const currentQrId = ref('')
const polling = ref(false)
const errorMsg = ref('')

watch(
  () => props.open,
  (val) => {
    if (val) start()
  },
)

async function start() {
  step.value = 'loading'
  qrCode.value = ''
  currentQrId.value = ''
  try {
    const data = await import40ContractApi.sigexStartSigning(props.clientId)
    qrCode.value = data.qrCode
    eGovMobileLink.value = data.eGovMobileLaunchLink
    eGovBusinessLink.value = data.eGovBusinessLaunchLink
    currentQrId.value = data.qrId
    step.value = 'qr'
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error ?? 'Не удалось создать сессию подписания'
    step.value = 'error'
  }
}

async function poll() {
  if (!currentQrId.value) return
  polling.value = true
  try {
    const result = await import40ContractApi.sigexPoll(props.clientId, currentQrId.value)
    if (result.pending) {
      message.warning('Документ ещё не подписан. Подпишите через eGov Mobile и повторите.')
      return
    }
    await import40ContractApi.sigexComplete(props.clientId, currentQrId.value, props.side)
    step.value = 'success'
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error ?? 'Ошибка при проверке подписи'
    step.value = 'error'
  } finally {
    polling.value = false
  }
}
</script>

<style scoped>
.sigex-body { display: flex; flex-direction: column; gap: 16px; }
.sigex-center { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 0; text-align: center; }
.sigex-desc { color: var(--atg-charcoal, #333); font-size: 14px; line-height: 1.6; margin: 0; }
.sigex-hint { color: var(--atg-muted, #888); font-size: 13px; margin: 0; }

.sigex-qr-wrap { display: flex; justify-content: center; padding: 8px; }
.sigex-qr { width: 220px; height: 220px; border: 1px solid #e0e0e0; border-radius: 8px; }

.sigex-links { display: flex; gap: 12px; justify-content: center; }
.sigex-link-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 6px; font-size: 14px; font-weight: 600;
  text-decoration: none; transition: opacity 0.15s;
}
.sigex-link-btn:hover { opacity: 0.85; }
.sigex-egov-mobile { background: #1677ff; color: #fff; }
.sigex-egov-biz { background: #52c41a; color: #fff; }

.sigex-poll-row { display: flex; flex-direction: column; align-items: center; gap: 10px; }

.sigex-icon-ok { font-size: 52px; color: #52c41a; }
.sigex-icon-err { font-size: 52px; color: #ff4d4f; }
.sigex-success h3 { color: #389e0d; margin: 0; }
.sigex-error h3 { color: #cf1322; margin: 0; }
</style>
