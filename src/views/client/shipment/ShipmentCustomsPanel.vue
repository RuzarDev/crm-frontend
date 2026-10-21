<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhChatCircleText, PhClock, PhSiren, PhUploadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { customsRequestsApi, type CustomsRequestDto } from '@/api/customsRequests'
import { import40Api } from '@/api/import40'
import { defaultUploadKind, docKindName, dueDateLabel, dueTimeLabel, isActive, isOverdue, stageOf } from '@/utils/customsRequests'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// «Нужно от вас · ответ таможне» в карточке поставки клиента (волна 17.10, задача 5; макет этапов — жёлтый блок).
// Ждёт ответа — gold-панель: что запросила таможня, документы, срок; «Загрузить документ» (файл нужного вида сразу уходит
// декларанту ответом) и «Ответить» (сообщение). Клиент ответил, декларант ещё не передал — нейтральная плашка
// «Ответ отправлен» с «Дополнить ответ». Закрытые запросы не показываем — они в истории поставки.
const props = defineProps<{ caseId: string; requests: CustomsRequestDto[] }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const uid = useId()

const shown = computed(() => props.requests.filter(isActive))

// Форматы и размер — как проверяет сервер (ReestrDocumentRules, 25 МБ), как в ShipmentAskPanel.
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const MAX_MB = 25

// Состояние по запросу: вид документа для загрузки, раскрыт ли ответ и его текст.
const kindOf = reactive<Record<string, string>>({})
const replyOpen = reactive<Record<string, boolean>>({})
const replyText = reactive<Record<string, string>>({})
const busy = ref<string | null>(null)

const kindFor = (r: CustomsRequestDto) => kindOf[r.id] ?? defaultUploadKind(r)
const kindOptions = (r: CustomsRequestDto) => {
  const kinds = r.docKinds.length ? [...r.docKinds, ...(r.docKinds.includes('other') ? [] : ['other'])] : ['other']
  return kinds.map((k) => ({ value: k, label: docKindName(k, t) }))
}

const upload = async (r: CustomsRequestDto, file: File) => {
  if (busy.value) return
  busy.value = `upload:${r.id}`
  try {
    const f = await import40Api.uploadFile(props.caseId, 'documents', file, kindFor(r))
    await customsRequestsApi.answer(props.caseId, r.id, { text: '', fileIds: [f.id] })
    message.success(t('customsRequest.uploaded'))
    emit('changed')
  } catch {
    // Текст ошибки показал общий перехватчик (api/client.ts).
  } finally {
    busy.value = null
  }
}

const send = async (r: CustomsRequestDto) => {
  const text = (replyText[r.id] ?? '').trim()
  if (!text || busy.value) return
  busy.value = `reply:${r.id}`
  try {
    await customsRequestsApi.answer(props.caseId, r.id, { text, fileIds: [] })
    replyText[r.id] = ''
    replyOpen[r.id] = false
    message.success(t('customsRequest.sent'))
    emit('changed')
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    busy.value = null
  }
}

const docsOf = (r: CustomsRequestDto) => r.docKinds.map((k) => docKindName(k, t)).join(', ')

/** «Ответьте до 17.10.2026 в 15:00» / «Ответьте до 17.10.2026»; срок прошёл — «Срок ответа прошёл …». */
const dueText = (r: CustomsRequestDto) => {
  if (!r.dueAtUtc) return ''
  const date = dueDateLabel(r)
  const time = dueTimeLabel(r)
  if (isOverdue(r)) return t('customsRequest.clientOverdue', { date: time ? `${date} ${time}` : date })
  return time ? t('customsRequest.clientDueAt', { date, time }) : t('customsRequest.clientDue', { date })
}

const panel = 'flex flex-col gap-2.5 rounded-panel border p-4 sm:px-[22px] sm:py-5'
const badge = 'hidden size-9 shrink-0 items-center justify-center rounded-[10px] sm:flex'
const h2 = 'm-0 text-base leading-6 font-semibold text-ink'
const text = 'm-0 text-sm leading-[1.45] text-ink-2'
// Кнопки: 42px на компьютере, на телефоне — во всю ширину и 48px (как в ShipmentAskPanel).
const mainBtn = 'h-[42px] rounded-row px-[18px] text-[14.5px] max-sm:h-12 max-sm:w-full max-sm:rounded-[12px] max-sm:text-[15px]'
const secondBtn = 'h-[42px] rounded-row px-4 text-[14.5px] max-sm:h-12 max-sm:w-full max-sm:rounded-[12px] max-sm:text-[15px]'
const uploadMain = 'max-sm:block max-sm:w-full [&>button]:h-[42px] [&>button]:rounded-row [&>button]:px-[18px] [&>button]:text-[14.5px] max-sm:[&>button]:h-12 max-sm:[&>button]:w-full max-sm:[&>button]:rounded-[12px] max-sm:[&>button]:text-[15px]'
</script>

<template>
  <template v-for="r in shown" :key="r.id">
    <section
      v-if="r.status === 'open'"
      :aria-labelledby="`cr-${uid}-${r.id}`"
      :class="cn(panel, 'border-gold-line bg-gold-soft')"
      data-customs-ask
    >
      <div class="flex min-w-0 items-start gap-3.5">
        <span aria-hidden="true" :class="cn(badge, 'bg-gold text-navy')"><PhSiren :size="19" weight="bold" /></span>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h2 :id="`cr-${uid}-${r.id}`" :class="h2">{{ t('customsRequest.clientTitle') }}</h2>
          <p class="m-0 text-[13px] font-medium text-gold-ink" data-customs-ask-stage>{{ t(`customsRequest.stage.${stageOf(r)}`) }}</p>
          <p :class="cn(text, 'whitespace-pre-line [overflow-wrap:anywhere]')" data-customs-ask-text>
            <span class="font-medium text-ink">{{ t('customsRequest.clientText') }}<template v-if="r.declarationNumber"> ({{ t('customsRequest.dt', { n: r.declarationNumber }) }})</template>:</span>
            {{ r.text }}
          </p>
          <p v-if="r.docKinds.length" :class="text" data-customs-ask-docs>{{ t('customsRequest.docs', { list: docsOf(r) }) }}</p>
          <!-- Срок — крупно: при проверке ДТ опоздание грозит отказом в выпуске (ТК ЕАЭС ст. 325, 125). -->
          <p
            v-if="r.dueAtUtc"
            :class="cn(
              'm-0 mt-1 flex items-center gap-2 self-start rounded-row px-3 py-2 text-[15px] leading-5 font-semibold',
              isOverdue(r) ? 'bg-tone-danger-bg text-tone-danger-fg' : 'bg-surface text-ink',
            )"
            :data-overdue="isOverdue(r) || undefined"
            data-customs-ask-due
          >
            <PhClock :size="17" weight="bold" class="shrink-0" aria-hidden="true" />
            <span>{{ dueText(r) }}</span>
          </p>
          <p :class="cn(text, 'text-ink-3')" data-customs-ask-hint>{{ t(`customsRequest.clientStageHint.${stageOf(r)}`) }}</p>
        </div>
      </div>

      <div class="flex flex-col gap-2.5 sm:pl-[50px]">
        <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end">
          <ZField v-if="kindOptions(r).length > 1" :label="t('customsRequest.uploadKind')" class="sm:w-64">
            <ZSelect
              :value="kindFor(r)"
              :options="kindOptions(r)"
              data-customs-ask-kind
              @update:value="(v) => { kindOf[r.id] = String(v) }"
            />
          </ZField>
          <ZUpload
            :accept="ACCEPT"
            convert-heic
            :max-size-mb="MAX_MB"
            :loading="busy === `upload:${r.id}`"
            :disabled="!!busy && busy !== `upload:${r.id}`"
            button-variant="primary"
            :class="uploadMain"
            :custom-request="({ file }) => upload(r, file)"
            data-customs-ask-upload
          >
            <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
            {{ t('customsRequest.upload') }}
          </ZUpload>
          <ZButton
            v-if="!replyOpen[r.id]"
            variant="ghost"
            :class="cn(secondBtn, 'bg-surface')"
            :disabled="!!busy"
            data-customs-ask-reply
            @click="replyOpen[r.id] = true"
          >
            <template #icon><PhChatCircleText :size="16" aria-hidden="true" /></template>
            {{ t('customsRequest.reply') }}
          </ZButton>
        </div>
        <template v-if="replyOpen[r.id]">
          <ZField :label="t('customsRequest.replyLabel')">
            <ZTextarea
              :value="replyText[r.id] ?? ''"
              :rows="3"
              auto-grow
              :placeholder="t('customsRequest.replyPh')"
              class="max-sm:text-[15px]"
              data-customs-ask-reply-text
              @update:value="(v: string) => { replyText[r.id] = v }"
            />
          </ZField>
          <ZButton
            variant="primary"
            :class="cn(mainBtn, 'self-start')"
            :disabled="!(replyText[r.id] ?? '').trim() || (!!busy && busy !== `reply:${r.id}`)"
            :loading="busy === `reply:${r.id}`"
            data-customs-ask-send
            @click="send(r)"
          >{{ t('customsRequest.send') }}</ZButton>
        </template>
      </div>
    </section>

    <section
      v-else
      :aria-labelledby="`cr-${uid}-${r.id}`"
      :class="cn(panel, 'border-line bg-canvas sm:py-4')"
      data-customs-answered
    >
      <div class="flex min-w-0 items-start gap-3.5">
        <span aria-hidden="true" :class="cn(badge, 'bg-sunken text-ink-2')"><PhChatCircleText :size="18" /></span>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h2 :id="`cr-${uid}-${r.id}`" :class="h2">{{ t('customsRequest.answeredClientTitle') }}</h2>
          <p :class="text">{{ t('customsRequest.answeredClientText') }}</p>
          <div class="mt-1 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <ZUpload
              :accept="ACCEPT"
              convert-heic
              :max-size-mb="MAX_MB"
              :loading="busy === `upload:${r.id}`"
              :disabled="!!busy && busy !== `upload:${r.id}`"
              button-variant="secondary"
              :class="cn(uploadMain, '[&>button]:bg-surface sm:[&>button]:h-9 sm:[&>button]:text-sm')"
              :custom-request="({ file }) => upload(r, file)"
              data-customs-more-upload
            >
              <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
              {{ t('customsRequest.upload') }}
            </ZUpload>
            <ZButton
              v-if="!replyOpen[r.id]"
              variant="ghost"
              :class="cn(secondBtn, 'sm:h-9 sm:text-sm')"
              :disabled="!!busy"
              data-customs-more-reply
              @click="replyOpen[r.id] = true"
            >{{ t('customsRequest.addMore') }}</ZButton>
          </div>
          <template v-if="replyOpen[r.id]">
            <ZField :label="t('customsRequest.replyLabel')" class="mt-1">
              <ZTextarea
                :value="replyText[r.id] ?? ''"
                :rows="3"
                auto-grow
                :placeholder="t('customsRequest.replyPh')"
                @update:value="(v: string) => { replyText[r.id] = v }"
              />
            </ZField>
            <ZButton
              variant="primary"
              :class="cn(mainBtn, 'self-start')"
              :disabled="!(replyText[r.id] ?? '').trim() || (!!busy && busy !== `reply:${r.id}`)"
              :loading="busy === `reply:${r.id}`"
              data-customs-more-send
              @click="send(r)"
            >{{ t('customsRequest.send') }}</ZButton>
          </template>
        </div>
      </div>
    </section>
  </template>
</template>
