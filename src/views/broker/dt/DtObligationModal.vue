<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { OBLIGATION_LIMITS, dtFormsApi, obligationFieldsFrom, type ObligationFields } from '@/api/dtForms'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { dtFormFileName, todayIso } from './dtForms'
import {
  emptyObligationFields, obligationBody, obligationMissing, OBLIGATION_DEFAULT_NUMBER, OBLIGATION_DOC_CODE,
} from './dtObligation'

// «Обязательство (условный выпуск)» — переделано 23.10.2026 по образцу письма, которое подают декларанты (голосовые 23.10):
// письмо руководителю ДГД — получатель уведомляет об условном выпуске до сертификации и обязуется 60 дней не передавать и
// не использовать товар. Таблицы товаров нет. Поля — значения по умолчанию из сохранённой ДТ (GET …/obligation/defaults:
// дата гр. А, инвойсы гр. 44, получатель и адрес гр. 8, страна гр. 15, пост гр. А, СВХ гр. 30), все правятся; сервер
// рендерит ровно присланное. Пустые Ф.И.О. или адрес — подтверждение «места останутся пустыми». После формирования —
// по желанию строка гр. 44 08999 (номер = исх. №, дата = дата обязательства): родитель кладёт её в форму, сохранит автосейв.
const props = defineProps<{
  open: boolean
  caseId: string
  dtId: string
  /** Руководитель из профиля клиента — Ф.И.О., если значения по умолчанию не загрузились. */
  directorName: string | null
  /** Можно обновить строку гр. 44 08999 (ДТ открыта для правки). */
  canAddDoc44: boolean
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; doc44: [doc: { number: string | null; date: string }] }>()
const { t } = useI18n()
const { confirm } = useConfirm()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.dt.forms.obligation.${key}`, p ?? {})

const fields = ref<ObligationFields>(emptyObligationFields(todayIso(), null))
const loading = ref(false)
const loadFailed = ref(false)
const busy = ref(false)
const addDoc44 = ref(true)

let seq = 0
const load = async () => {
  const my = ++seq
  const today = todayIso()
  loading.value = true
  loadFailed.value = false
  try {
    const raw = await dtFormsApi.obligationDefaults(props.caseId, props.dtId)
    if (my === seq) fields.value = obligationFieldsFrom(raw, today)
  } catch {
    // Значения по умолчанию не пришли — поля можно заполнить вручную; «Повторить» — в плашке.
    if (my !== seq) return
    loadFailed.value = true
    fields.value = emptyObligationFields(today, props.directorName)
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => props.open, (open) => {
  if (!open) return
  addDoc44.value = props.canAddDoc44
  void load()
}, { immediate: true })

const MAX = OBLIGATION_LIMITS
const addInvoice = () => {
  if (fields.value.invoices.length >= MAX.invoices) return
  fields.value.invoices.push({ number: null, date: null })
}
const removeInvoice = (i: number) => { fields.value.invoices.splice(i, 1) }

const canGenerate = computed(() => !loading.value && !!fields.value.date)
const close = () => emit('update:open', false)

const generate = async () => {
  if (busy.value || !canGenerate.value) return
  const missing = obligationMissing(fields.value)
  if (missing.length && !(await confirm({
    title: t('broker.dt.forms.missingTitle', { list: missing.map((k) => t(`broker.dt.forms.missing.${k}`)).join(', ') }),
    content: t('broker.dt.forms.missingText'),
    okText: t('broker.dt.forms.generate'),
    cancelText: t('common.cancel'),
  }))) return
  const body = obligationBody(fields.value)
  busy.value = true
  try {
    const res = await dtFormsApi.obligation(props.caseId, props.dtId, body)
    if ('error' in res) {
      message.error(res.error)
      return
    }
    // Имя файла — по-русски, как сам документ: получатель и дата обязательства.
    saveBlob(res.blob, dtFormFileName('Обязательство', body.consigneeName, body.date))
    if (addDoc44.value && props.canAddDoc44) emit('doc44', { number: body.number, date: body.date })
    message.success(tr('done'))
    close()
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="tr('title')"
    :width="760"
    :ok-text="t('broker.dt.forms.generate')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="busy"
    :ok-button-props="{ disabled: !canGenerate }"
    data-dt-obligation-modal
    @update:open="emit('update:open', $event)"
    @ok="generate"
  >
    <div class="flex flex-col gap-3 pb-2">
      <p class="m-0 text-[13px] text-ink-3">{{ tr('lead') }}</p>
      <ZAlert v-if="loadFailed" type="warning" show-icon :message="tr('loadFailed')" data-dt-obligation-load-failed>
        <ZButton size="sm" class="mt-2 max-sm:h-11" data-dt-obligation-retry @click="load">{{ tr('retry') }}</ZButton>
      </ZAlert>

      <div v-if="loading" class="flex flex-col gap-3" aria-busy="true" data-dt-obligation-loading>
        <ZSkeleton :lines="6" height="32px" />
      </div>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <ZField :label="tr('date')" :help="tr('dateHelp')" required>
          <ZDate :value="fields.date || null" data-dt-obligation-date @update:value="fields.date = $event ?? ''" />
        </ZField>
        <ZField :label="tr('number')" :help="tr('numberHelp')">
          <ZInput v-model:value="fields.number" :maxlength="MAX.number" mono :placeholder="OBLIGATION_DEFAULT_NUMBER" data-dt-obligation-number />
        </ZField>
        <ZField :label="tr('consignee')" :help="tr('consigneeHelp')" class="sm:col-span-2">
          <ZInput v-model:value="fields.consigneeName" :maxlength="MAX.text" data-dt-obligation-consignee />
        </ZField>

        <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0 sm:col-span-2" data-dt-obligation-invoices>
          <legend class="mb-1 p-0 text-[13px] font-medium text-ink-2">{{ tr('invoices') }}</legend>
          <p v-if="!fields.invoices.length" class="m-0 text-[13px] text-ink-3" data-dt-obligation-no-invoices>{{ tr('noInvoices') }}</p>
          <div
            v-for="(inv, i) in fields.invoices"
            :key="i"
            class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
            :data-dt-obligation-invoice="i"
          >
            <ZInput
              v-model:value="inv.number"
              :maxlength="MAX.text"
              mono
              :placeholder="tr('invoiceNumber')"
              :aria-label="tr('invoiceNumberOf', { n: i + 1 })"
              class="max-sm:col-span-2"
              data-dt-obligation-invoice-number
            />
            <ZDate v-model:value="inv.date" :aria-label="tr('invoiceDateOf', { n: i + 1 })" data-dt-obligation-invoice-date />
            <ZButton
              variant="ghost"
              :aria-label="tr('removeInvoice', { n: i + 1 })"
              :title="tr('removeInvoice', { n: i + 1 })"
              class="max-sm:h-11 max-sm:w-11"
              data-dt-obligation-invoice-remove
              @click="removeInvoice(i)"
            >
              <PhTrash :size="16" aria-hidden="true" />
            </ZButton>
          </div>
          <div>
            <ZButton
              size="sm"
              variant="ghost"
              :disabled="fields.invoices.length >= MAX.invoices"
              class="max-sm:h-11"
              data-dt-obligation-invoice-add
              @click="addInvoice"
            >
              <PhPlus :size="14" aria-hidden="true" />{{ tr('addInvoice') }}
            </ZButton>
          </div>
        </fieldset>

        <ZField :label="tr('countryFrom')" :help="tr('countryFromHelp')">
          <ZInput v-model:value="fields.countryFrom" :maxlength="MAX.text" :placeholder="tr('countryFromPlaceholder')" data-dt-obligation-country />
        </ZField>
        <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
          <ZField :label="tr('postCode')">
            <ZInput v-model:value="fields.postCode" :maxlength="MAX.text" mono data-dt-obligation-post-code />
          </ZField>
          <ZField :label="tr('postName')">
            <ZInput v-model:value="fields.postName" :maxlength="MAX.text" data-dt-obligation-post-name />
          </ZField>
        </div>
        <ZField :label="tr('warehouse')" :help="tr('warehouseHelp')" class="sm:col-span-2">
          <ZInput v-model:value="fields.warehouseName" :maxlength="MAX.text" data-dt-obligation-warehouse />
        </ZField>
        <ZField :label="tr('address')" :help="tr('addressHelp')" class="sm:col-span-2">
          <ZTextarea v-model:value="fields.address" :rows="2" auto-grow :maxlength="MAX.address" data-dt-obligation-address />
        </ZField>
        <ZField :label="t('broker.dt.forms.position')">
          <ZInput v-model:value="fields.signerPosition" :maxlength="MAX.text" data-dt-obligation-position />
        </ZField>
        <ZField :label="t('broker.dt.forms.signer')">
          <ZInput v-model:value="fields.signerName" :maxlength="MAX.text" data-dt-obligation-signer />
        </ZField>
      </div>
      <div v-if="canAddDoc44 && !loading">
        <ZCheckbox v-model:checked="addDoc44" data-dt-obligation-doc44>{{ tr('addDoc44', { code: OBLIGATION_DOC_CODE }) }}</ZCheckbox>
      </div>
    </div>
  </ZModal>
</template>
