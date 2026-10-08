<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhLock } from '@phosphor-icons/vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { reestrApi } from '@/api/reestr'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import {
  ReestrBrokerDocumentType as BrokerType,
  type ReestrBrokerDocumentType, type ReestrDocumentDto, type ReestrDocumentSection, type ReestrEntryStatus,
} from '@/types/api'
import DocFileList from './DocFileList.vue'
import InvoiceAutofill from './InvoiceAutofill.vue'
import { isBrokerSectionClosed, useRecordPermissions } from './recordPermissions'

// Вкладка «Документы» записи транзита (разбор §4): «Документы клиента» — один список с действиями «Заполнить из инвойса»
// и «Загрузить»; «Документы брокера» — четыре места (декларация, сертификаты, разрешения, прочее), в «Выпущен» и «Архив»
// секция закрыта. Права — recordPermissions. Несколько файлов за раз грузятся по очереди, итог — «Загружено n из m».
// Список грузится при монтировании и сообщает длину (count): страница держит вкладку смонтированной скрытой
// (v-show), чтобы счётчик «Документы n» был виден до перехода во вкладку. reload() — для страницы.
const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx']
const MAX_BYTES = 10 * 1024 * 1024

const props = defineProps<{ reestrId: string; status: ReestrEntryStatus; dirty: boolean }>()
const emit = defineEmits<{ applied: [count: number]; count: [n: number] }>()

const { t } = useI18n()
const { confirm } = useConfirm()
const perms = useRecordPermissions()

const documents = ref<ReestrDocumentDto[]>([])
const loaded = ref(false)
const uploadingKey = ref<string | null>(null)
const removingId = ref<string | null>(null)
const busy = computed(() => uploadingKey.value !== null || removingId.value !== null)
let seq = 0
let alive = true
onBeforeUnmount(() => { alive = false })

const load = async () => {
  if (!props.reestrId) return
  const mine = ++seq
  try {
    const list = await reestrApi.listDocuments(props.reestrId)
    if (mine !== seq || !alive) return
    documents.value = list
  } catch {
    if (mine === seq && alive) documents.value = []
  } finally {
    if (mine === seq && alive) {
      loaded.value = true
      emit('count', documents.value.length)
    }
  }
}
watch(() => props.reestrId, () => { loaded.value = false; void load() }, { immediate: true })
defineExpose({ reload: load })

// ---- Что показываем ----
const closed = computed(() => isBrokerSectionClosed(props.status))
const clientDocs = computed(() => documents.value.filter((d) => d.section === 'client'))
const slots = computed(() => [
  { type: BrokerType.CustomsDeclaration, label: t('transit.tamozhennayaDeklaraciya'), required: true },
  { type: BrokerType.ConformityCertificates, label: t('transit.sertifikatySootvetstviya'), required: false },
  { type: BrokerType.PermitsAndLicenses, label: t('transit.razresheniyaILicenzii'), required: false },
  { type: BrokerType.Other, label: t('transit.inyeDokumenty'), required: false },
])
const slotDocs = (type: ReestrBrokerDocumentType) =>
  documents.value.filter((d) => d.section === 'broker' && (d.brokerDocumentType ?? BrokerType.Other) === type)

const canUploadClient = computed(() => perms.canUploadClientDoc())
const canUploadBroker = computed(() => perms.canUploadBrokerDoc(props.status))
const showAutofill = computed(() => perms.canSeeAutofill())
const autofillEnabled = computed(() => perms.canAutofill(props.dirty))
const canRemove = (d: ReestrDocumentDto) => perms.canDeleteDoc(d, props.status)

// ---- Загрузка ----
const validFile = (f: File): boolean => {
  const name = f.name.toLowerCase()
  if (!ALLOWED.some((ext) => name.endsWith(ext))) {
    message.error(t('transit.dopustimyPdfJpgPng'))
    return false
  }
  if (f.size > MAX_BYTES) {
    message.error(t('transit.razmerFaylaNeDolzhen'))
    return false
  }
  return true
}

/**
 * Файлы грузятся по очереди. Если один не принят (тост показал перехватчик), уже загруженные остаются:
 * список перечитывается, при частичном успехе — тост «Загружено n из m».
 */
const upload = async (key: string, files: File[], section: ReestrDocumentSection, brokerType?: ReestrBrokerDocumentType) => {
  if (busy.value) return
  const list = files.filter(validFile)
  if (!list.length) return
  uploadingKey.value = key
  let uploaded = 0
  let failed = false
  try {
    for (const f of list) {
      try {
        await reestrApi.uploadDocument(props.reestrId, section, f, brokerType)
        uploaded++
      } catch {
        failed = true
        break
      }
    }
    if (failed) {
      if (uploaded > 0) message.warning(t('broker.transitRecord.docs.uploadedOf', { n: uploaded, m: list.length }))
    } else {
      message.success(list.length > 1 ? t('broker.transitRecord.docs.uploadedOf', { n: uploaded, m: list.length }) : t('transit.dokumentZagruzhen'))
    }
    await load()
  } finally {
    uploadingKey.value = null
  }
}

// ---- Удаление ----
const remove = async (d: ReestrDocumentDto) => {
  if (busy.value) return
  const ok = await confirm({
    title: t('sales.udalitDokument'),
    content: d.originalFileName,
    okText: t('broker.transitRecord.docs.deleteOk'),
    cancelText: t('sales.net'),
    danger: true,
  })
  if (!ok) return
  removingId.value = d.id
  try {
    await reestrApi.deleteDocument(props.reestrId, d.id)
    message.success(t('transit.dokumentUdalen'))
    await load()
  } catch {
    // Текст ошибки показал общий перехватчик (api/client.ts).
  } finally {
    removingId.value = null
  }
}

const onApplied = async (n: number) => {
  await load()
  emit('applied', n)
}

const panel = 'flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 max-sm:p-3'
const uploadCls = 'max-sm:[&_button]:h-11'
</script>

<template>
  <div class="flex flex-col gap-4" data-record-documents>
    <ZSkeleton v-if="!loaded" :lines="4" height="40px" :aria-label="t('broker.transitRecord.docs.loading')" />
    <template v-else>
      <section :class="panel" data-docs-client :aria-labelledby="'docs-client-title'">
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <h2 id="docs-client-title" class="m-0 text-base leading-6 font-semibold text-ink">{{ t('transit.dokumentyKlienta') }}</h2>
          <span class="rounded-pill bg-sunken px-1.5 text-xs text-ink-2 tabular-nums" data-docs-count="client">{{ clientDocs.length }}</span>
          <div v-if="showAutofill || canUploadClient" class="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full">
            <InvoiceAutofill
              v-if="showAutofill"
              :reestr-id="reestrId"
              :disabled="!autofillEnabled || busy"
              @uploaded="load"
              @applied="onApplied"
            />
            <ZUpload
              v-if="canUploadClient"
              multiple
              button-size="sm"
              :class="uploadCls"
              :loading="uploadingKey === 'client'"
              :disabled="busy && uploadingKey !== 'client'"
              data-upload="client"
              @select="upload('client', $event, 'client')"
            >{{ t('transit.zagruzit') }}</ZUpload>
          </div>
        </div>
        <p v-if="showAutofill && dirty" class="m-0 text-xs text-muted" role="status" data-autofill-hint>{{ t('broker.transitRecord.docs.autofillDirty') }}</p>
        <DocFileList :reestr-id="reestrId" :files="clientDocs" :can-remove="canRemove" :busy="busy" :removing-id="removingId" @remove="remove" />
        <p v-if="!clientDocs.length" class="m-0 text-sm text-ink-3" data-docs-empty="client">{{ t('sales.netDokumentov') }}</p>
      </section>

      <section :class="panel" data-docs-broker :aria-labelledby="'docs-broker-title'">
        <h2 id="docs-broker-title" class="m-0 text-base leading-6 font-semibold text-ink">{{ t('transit.dokumentyBrokera') }}</h2>
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div
            v-for="slot in slots"
            :key="slot.type"
            class="flex min-w-0 flex-col gap-2.5 rounded-row border border-line bg-surface p-3"
            :data-broker-slot="slot.type"
          >
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span class="text-[13px] font-semibold text-ink">
                {{ slot.label }}<span v-if="slot.required" class="ml-0.5 text-danger" aria-hidden="true">*</span><span v-if="slot.required" class="sr-only"> ({{ t('broker.transitRecord.docs.required') }})</span>
              </span>
              <span class="rounded-pill bg-sunken px-1.5 text-xs text-ink-2 tabular-nums" data-slot-count>{{ slotDocs(slot.type).length }}</span>
              <ZUpload
                v-if="canUploadBroker"
                multiple
                button-size="sm"
                :class="[uploadCls, 'ml-auto']"
                :loading="uploadingKey === `broker:${slot.type}`"
                :disabled="busy && uploadingKey !== `broker:${slot.type}`"
                :aria-label="t('broker.transitRecord.docs.uploadTo', { slot: slot.label })"
                :data-upload="`broker:${slot.type}`"
                @select="upload(`broker:${slot.type}`, $event, 'broker', slot.type)"
              >{{ t('transit.zagruzit') }}</ZUpload>
            </div>
            <DocFileList :reestr-id="reestrId" :files="slotDocs(slot.type)" :can-remove="canRemove" :busy="busy" :removing-id="removingId" @remove="remove" />
            <p v-if="!slotDocs(slot.type).length" class="m-0 text-sm text-ink-3" data-slot-empty>{{ t('broker.transitRecord.docs.emptySlot') }}</p>
          </div>
        </div>
        <p v-if="closed" class="m-0 flex items-center gap-2 rounded-row bg-sunken px-3 py-2 text-xs font-semibold text-ink-2" role="status" data-broker-closed>
          <PhLock :size="14" aria-hidden="true" />{{ t('transit.sekciyaZakrytaStatusNe') }}
        </p>
      </section>
    </template>
  </div>
</template>
