<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhDownloadSimple, PhFilePlus, PhKey, PhQrCode, PhSealCheck, PhUploadSimple } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZTag from '@/components/z/ZTag.vue'
import ClientSigexModal from '@/components/client/ClientSigexModal.vue'
import { canRenewContract, import40ContractApi, isDocumentEffective, type Import40DocumentDto } from '@/api/import40Contract'
import { extractServerText } from '@/api/client'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { endOfDayUtc, isOpen, localDate, todayYmd, validDate } from '@/views/client/company/company'
import { ncaSignErrorText, signDocumentWithNcaLayer } from '@/views/client/company/ncaSign'
import { REVOKED, isExpired, multiBlocked, nextYearPoa, poaTargetYear, statusKey, statusTone, type DocKind, type SignSide } from './staffCompany'

// Договор / доверенность клиента для сотрудника (волна 7, замена Import40DocumentStep): сформировать (разовый,
// «действует до»), список документов со статусами, скачать .docx, отозвать (администратор), подписи клиента и
// AQNIET (eGov по QR или загрузка подписанного файла). Ошибки сервера — его текстом на месте. После успеха —
// refresh() экрана; кнопка занята, пока документы не перечитаны.
const props = defineProps<{
  kind: DocKind
  docs: Import40DocumentDto[]
  clientId: string
  profileComplete: boolean
  /** Отзыв и подпись за клиента — только администратор (как на сервере). */
  isAdmin: boolean
  /** Подпись за AQNIET: администратор или руководитель отдела (как на сервере). */
  canSignProvider: boolean
  refresh: () => Promise<unknown>
}>()
const { t } = useI18n()
const { confirm } = useConfirm()
const titleId = `staff-docs-${useId()}`

const k = (key: string) => `broker.company.${props.kind}.${key}`
const hasProvider = computed(() => props.kind === 'contract')
const no = (d: Import40DocumentDto) => `${d.number}/${d.year}`

const errText = (e: unknown, fallback: string) =>
  extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? fallback

const refreshing = ref(false)
const refreshAfter = async () => {
  refreshing.value = true
  try {
    await props.refresh()
  } finally {
    refreshing.value = false
  }
}

// ---- Сформировать ----
const blockedBy = computed(() => multiBlocked(props.kind, props.docs))
const validUntil = ref<string | null>(null)
// Доверенность на следующий год уже выпущена (раунд 1 ревью, M-7) — вторую многоразовую сервер не выпустит, только разовую.
const nextPoa = computed(() => nextYearPoa(props.kind, props.docs, poaTargetYear(validUntil.value)))
const blocked = computed(() => blockedBy.value !== null || nextPoa.value !== null)
const singleUse = ref(false)
watch(blocked, (v) => { if (v) singleUse.value = true }, { immediate: true })
const generating = ref(false)
const generateError = ref('')
// C-17 (30.10.2026): у многоразового договора срок ставит сервер (до 31.12 года подписания) — дату не выбираем.
const pickUntil = computed(() => props.kind === 'poa' || singleUse.value)
const minDate = todayYmd()
// Календарь (Reka DatePicker) — отдельным куском, как в кабинете клиента.
const ZDate = defineAsyncComponent(() => import('@/components/z/ZDate.vue'))

const generate = async () => {
  if (generating.value || refreshing.value || !props.profileComplete) return
  generating.value = true
  generateError.value = ''
  try {
    await import40ContractApi.generateDocument(props.clientId, {
      kind: props.kind,
      isSingleUse: singleUse.value,
      // Конец выбранного дня по UTC — как сервер ставит сроки по умолчанию и как их показывает кабинет клиента.
      validUntilUtc: pickUntil.value && validUntil.value ? endOfDayUtc(validUntil.value) : null,
    }, { silent: true })
    message.success(t(k('generated')))
    await refreshAfter()
  } catch (e) {
    // 409 «второй многоразовый», «профиль не заполнен» — текстом сервера.
    generateError.value = errText(e, t('broker.company.generateError'))
  } finally {
    generating.value = false
  }
}

// ---- Ошибки действий с документом — у самого документа ----
const docErrors = ref<Record<string, string>>({})
const setDocError = (id: string, text: string) => { docErrors.value = { ...docErrors.value, [id]: text } }
watch(() => props.docs, () => { docErrors.value = {} })

// ---- Скачать .docx ----
const downloadingId = ref<string | null>(null)
const download = async (d: Import40DocumentDto) => {
  if (downloadingId.value) return
  downloadingId.value = d.id
  try {
    saveBlob(await import40ContractApi.downloadDocument(props.clientId, d.id), `${t(k('file'))}-${d.number}-${d.year}.docx`)
  } catch (e) {
    // HTTP-ошибку уже показал общий перехватчик — здесь только сбой без ответа.
    if (!(e as { response?: unknown })?.response) message.error(t('broker.company.downloadError'))
  } finally {
    downloadingId.value = null
  }
}

// ---- Отозвать (администратор) ----
const revokingId = ref<string | null>(null)
const revoke = async (d: Import40DocumentDto) => {
  if (revokingId.value) return
  const ok = await confirm({
    title: t('broker.company.revokeTitle', { no: no(d) }),
    content: t('broker.company.revokeConfirm'),
    okText: t('broker.company.revoke'),
    danger: true,
  })
  if (!ok) return
  revokingId.value = d.id
  try {
    await import40ContractApi.revokeDocument(props.clientId, d.id, { silent: true })
    message.success(t('broker.company.revoked'))
    await refreshAfter()
  } catch (e) {
    setDocError(d.id, errText(e, t('broker.company.revokeError')))
  } finally {
    revokingId.value = null
  }
}

// ---- Продлить многоразовый договор (30.10.2026): до 31.12 следующего года; администратор или руководитель ----
// Кнопка — за 60 дней до конца срока и 30 дней после (как на сервере), иначе скрыта.
const canRenew = (d: Import40DocumentDto) => props.canSignProvider && canRenewContract(d)
const renewedUntil = (d: Import40DocumentDto) => `31.12.${new Date(d.validUntilUtc!).getUTCFullYear() + 1}`
const renewingId = ref<string | null>(null)
const renew = async (d: Import40DocumentDto) => {
  if (renewingId.value || refreshing.value) return
  const ok = await confirm({
    title: t('broker.company.renewTitle', { no: no(d) }),
    content: t('broker.company.renewConfirm', { date: renewedUntil(d) }),
    okText: t('broker.company.renew'),
  })
  if (!ok) return
  renewingId.value = d.id
  try {
    const renewed = await import40ContractApi.renewDocument(props.clientId, d.id, { silent: true })
    message.success(t('broker.company.renewed', { date: validDate(renewed.validUntilUtc) }))
    await refreshAfter()
  } catch (e) {
    setDocError(d.id, errText(e, t('broker.company.renewError')))
  } finally {
    renewingId.value = null
  }
}

// ---- Подпись: загрузка подписанного файла ----
const fileInput = ref<HTMLInputElement>()
const pending = ref<{ doc: Import40DocumentDto; side: SignSide } | null>(null)
const uploading = ref<string | null>(null)
const pickFile = (doc: Import40DocumentDto, side: SignSide) => {
  if (uploading.value || refreshing.value) return
  pending.value = { doc, side }
  fileInput.value?.click()
}
const onFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  const target = pending.value
  input.value = ''
  pending.value = null
  if (!file || !target) return
  uploading.value = `${target.doc.id}:${target.side}`
  try {
    await import40ContractApi.signDocument(props.clientId, target.doc.id, target.side, file, { silent: true })
    message.success(t('broker.company.fileUploaded'))
    await refreshAfter()
  } catch (err) {
    setDocError(target.doc.id, errText(err, t('broker.company.fileUploadError')))
  } finally {
    uploading.value = null
  }
}

// ---- Подпись в NCALayer (20.10.2026) ----
const ncaSigning = ref<string | null>(null)
const signNca = async (doc: Import40DocumentDto, side: SignSide) => {
  if (ncaSigning.value || uploading.value || refreshing.value) return
  ncaSigning.value = `${doc.id}:${side}`
  try {
    await signDocumentWithNcaLayer(props.clientId, doc, side)
    message.success(t('broker.company.signedNca'))
    await refreshAfter()
  } catch (err) {
    setDocError(doc.id, ncaSignErrorText(err, t, t('broker.company.fileUploadError')))
  } finally {
    ncaSigning.value = null
  }
}

// ---- Подпись через eGov ----
const sigexOpen = ref(false)
const sigexDocId = ref<string | null>(null)
const sigexSide = ref<SignSide>('client')
const openSigex = (doc: Import40DocumentDto, side: SignSide) => {
  if (refreshing.value || uploading.value) return
  sigexDocId.value = doc.id
  sigexSide.value = side
  sigexOpen.value = true
}
const onSigned = () => {
  sigexOpen.value = false
  message.success(t('broker.company.signedEgov'))
  void refreshAfter()
}

// Подписывать можно только ждущий подписей документ (черновик или «на подписи»), как в кабинете клиента:
// отозванный или истёкший сервер при подписи сделал бы снова действующим.
// Кто какую подпись ставит с этого экрана (как на сервере): за клиента — только администратор,
// за AQNIET — администратор или РОП. Остальным кнопок нет — сервер ответил бы 403 уже после подписи в eGov.
const canSign = (side: SignSide) => (side === 'provider' ? props.canSignProvider : props.isAdmin)
const sides = computed<SignSide[]>(() => (hasProvider.value ? ['client', 'provider'] : ['client']))
const isSigned = (d: Import40DocumentDto, side: SignSide) => (side === 'client' ? d.clientSigned : d.providerSigned)

const actionBtn = 'h-9 px-3 text-sm max-sm:h-11 max-sm:flex-1'
</script>

<template>
  <section :aria-labelledby="titleId" class="flex flex-col gap-4" :data-staff-docs="kind">
    <input ref="fileInput" type="file" accept=".cms,.p7s,.sig" class="hidden" tabindex="-1" aria-hidden="true" data-sign-file @change="onFile" />

    <h2 :id="titleId" class="m-0 text-md font-semibold text-ink">{{ t(k('title')) }}</h2>

    <!-- Многоразовый договор у клиента один: пока он действует, сервер второй не выпустит — только разовый. -->
    <ZAlert
      v-if="blockedBy"
      type="info"
      show-icon
      :message="t(blockedBy === 'awaiting' ? 'broker.company.alreadyAwaiting' : 'broker.company.alreadyActive')"
      :description="t(isAdmin ? 'broker.company.alreadyActiveAdmin' : 'broker.company.alreadyActiveStaff')"
      data-already-active
    />
    <ZAlert
      v-else-if="nextPoa"
      type="info"
      show-icon
      :message="t('broker.company.poaNextYearExists', { no: no(nextPoa), year: new Date(nextPoa.validUntilUtc!).getUTCFullYear() })"
      :description="t('broker.company.poaNextYearHint')"
      data-next-year-poa
    />

    <!-- Сформировать -->
    <div class="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-row border border-dashed border-line px-4 py-3 max-sm:flex-col max-sm:items-stretch" data-generate-bar>
      <ZCheckbox
        :checked="singleUse"
        :disabled="blocked"
        class="min-h-9 max-sm:min-h-11"
        data-opt-single
        @update:checked="(v: boolean) => (singleUse = v)"
      >
        {{ t(k('singleUse')) }}
      </ZCheckbox>
      <p v-if="!pickUntil" class="m-0 max-w-[320px] text-[13px] text-ink-3" data-opt-contract-term>{{ t('client.company.doc.contractTerm') }}</p>
      <label v-else class="flex flex-col gap-1 text-[13px] text-ink-3">
        {{ t('broker.company.validUntil') }}
        <ZDate
          v-model:value="validUntil"
          :min="minDate"
          allow-clear
          :placeholder="t('broker.company.validUntilPh')"
          class="w-[200px] max-sm:h-11 max-sm:w-full"
          data-opt-until
        />
      </label>
      <ZButton
        variant="primary"
        :loading="generating || refreshing"
        :disabled="!profileComplete"
        class="h-9 px-4 max-sm:h-11 max-sm:w-full sm:ml-auto"
        data-doc-generate
        @click="generate"
      >
        <PhFilePlus :size="16" aria-hidden="true" />{{ t(singleUse ? 'broker.company.generateSingle' : 'broker.company.generate') }}
      </ZButton>
    </div>
    <p v-if="!profileComplete" class="m-0 text-sm text-ink-3" data-fill-first>{{ t('broker.company.fillFirst') }}</p>
    <ZAlert v-if="generateError" type="error" show-icon :message="generateError" data-generate-error />

    <!-- Документы -->
    <p v-if="!docs.length" class="m-0 text-sm text-ink-3" data-docs-empty>{{ t(k('empty')) }}</p>
    <ul v-else role="list" class="m-0 flex list-none flex-col gap-3 p-0">
      <li
        v-for="d in docs"
        :key="d.id"
        class="flex flex-col gap-3 rounded-row border border-line bg-surface px-4 py-3.5"
        :data-doc="d.id"
      >
        <div class="flex flex-wrap items-start gap-x-3 gap-y-2 max-sm:flex-col">
          <div class="min-w-0 flex-1">
            <p class="m-0 text-base font-semibold text-ink tabular-nums">№ {{ no(d) }}</p>
            <p class="m-0 mt-0.5 text-[13px] text-ink-3">{{ t('broker.company.generatedAt', { date: localDate(d.generatedAtUtc, true) }) }}</p>
          </div>
          <div class="flex flex-wrap gap-1.5" data-doc-tags>
            <ZTag v-if="isDocumentEffective(d)" tone="done" data-tag="effective">{{ t('broker.company.effective') }}</ZTag>
            <ZTag :tone="statusTone(d.status)" data-tag="status">{{ t(`broker.company.status.${statusKey(d.status)}`) }}</ZTag>
            <ZTag v-if="d.isSingleUse" tone="submitted" data-tag="single">
              {{ t('broker.company.singleTag') }}{{ d.consumedByCaseId ? ` · ${t('broker.company.consumed')}` : '' }}
            </ZTag>
            <ZTag v-if="d.validUntilUtc" :tone="isExpired(d) ? 'danger' : 'neutral'" data-tag="until">
              {{ t('broker.company.until', { date: validDate(d.validUntilUtc) }) }}
            </ZTag>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <ZButton :loading="downloadingId === d.id" :class="actionBtn" data-doc-download @click="download(d)">
            <PhDownloadSimple :size="16" aria-hidden="true" />{{ t('broker.company.download') }}
          </ZButton>
          <a
            v-if="d.verifyUrl"
            :href="d.verifyUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex h-9 items-center gap-1.5 rounded-field px-2 text-sm font-medium text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:h-11"
            data-doc-verify
          ><PhQrCode :size="16" aria-hidden="true" />{{ t('broker.company.verifyLink') }}</a>
          <ZButton
            v-if="canRenew(d)"
            variant="primary"
            :loading="renewingId === d.id"
            :class="actionBtn"
            data-doc-renew
            @click="renew(d)"
          >
            <PhArrowClockwise :size="16" aria-hidden="true" />{{ t('broker.company.renew') }}
          </ZButton>
          <ZButton
            v-if="isAdmin && d.status !== REVOKED"
            variant="danger-ghost"
            :loading="revokingId === d.id"
            :class="actionBtn"
            data-doc-revoke
            @click="revoke(d)"
          >
            {{ t('broker.company.revoke') }}
          </ZButton>
        </div>

        <p v-if="canRenew(d)" class="m-0 text-[13px] text-gold-ink" data-renew-hint>
          {{ t('broker.company.renewHint', { date: validDate(d.validUntilUtc) }) }}
        </p>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            v-for="side in sides"
            :key="side"
            class="flex min-w-0 flex-col gap-2 rounded-row border border-line bg-canvas px-3.5 py-3"
            :data-plate="side"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-ink">{{ t(`broker.company.sign.${side}`) }}</span>
              <ZTag :tone="isSigned(d, side) ? 'done' : 'neutral'" size="sm" data-sign-state>
                {{ t(isSigned(d, side) ? 'broker.company.signed' : 'broker.company.pending') }}
              </ZTag>
            </div>
            <template v-if="!isSigned(d, side) && isOpen(d) && canSign(side)">
              <div class="flex flex-wrap gap-2">
                <ZButton variant="primary" :class="actionBtn" data-sign-egov @click="openSigex(d, side)">
                  <PhSealCheck :size="16" aria-hidden="true" />{{ t('broker.company.signEgov') }}
                </ZButton>
                <ZButton :loading="ncaSigning === `${d.id}:${side}`" :class="actionBtn" data-sign-nca @click="signNca(d, side)">
                  <PhKey :size="16" aria-hidden="true" />{{ t('broker.company.signNca') }}
                </ZButton>
                <ZButton :loading="uploading === `${d.id}:${side}`" :class="actionBtn" data-sign-upload @click="pickFile(d, side)">
                  <PhUploadSimple :size="16" aria-hidden="true" />{{ t('broker.company.uploadSigned') }}
                </ZButton>
              </div>
              <p class="m-0 text-xs text-ink-3">{{ t('broker.company.uploadSignedHint') }}</p>
            </template>
          </div>
        </div>

        <p v-if="docErrors[d.id]" role="alert" class="m-0 text-[13px] text-tone-danger-fg" data-doc-error>{{ docErrors[d.id] }}</p>
      </li>
    </ul>

    <ClientSigexModal v-model:open="sigexOpen" :client-id="clientId" :doc-id="sigexDocId" :side="sigexSide" @signed="onSigned" />
  </section>
</template>
