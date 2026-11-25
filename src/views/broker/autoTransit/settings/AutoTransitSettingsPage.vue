<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import {
  deleteContractTemplate, downloadContractTemplate, getSettings, saveSettings, uploadContractTemplate,
  type AutoTransitSettings, type ContractTemplateInfo, type Doc44FileKind,
} from '@/api/autoTransit'
import { saveBlob } from '@/ui/download'
import { useConfirm } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'
import { message } from '@/ui/message'
import type { ZOption } from '@/ui/options'
import { fieldErrorsOf } from '../truck/useTruck'
import { useLocalOptions } from '@/views/broker/transit/record/sections/localOptions'

// «Настройки → Авто-транзит» (очередь 3, спека 2026-11-25, 4.4): что черновик новой ПИ подставляет сам —
// обеспечение по умолчанию (вид, основание 103, свидетельство УЭО) и шаблон документов гр. 44 (код, название, из файла
// какого вида брать номер и дату). Читать — autotransit.read, менять — autotransit.manage (как сервер). Данные фирмы
// в коде не зашиваются: умолчания отдаёт сервер, страница сохраняет настройку целиком.
const { t, te, locale } = useI18n()
const { confirm } = useConfirm()
const auth = useAuthStore()
const S = 'broker.autoTransit.settings'
const canEdit = computed(() => auth.hasPermission('autotransit.manage'))

const state = ref<'loading' | 'ready' | 'error'>('loading')
const draft = ref<AutoTransitSettings | null>(null)
const saved = ref<string>('')
const saving = ref(false)
const errors = ref<Record<string, string>>({})

// Этап 3б: шаблон договора экспедиции живёт отдельно от формы — загрузка и удаление сразу, без «Сохранить».
const contract = ref<ContractTemplateInfo | null>(null)
const contractKeys = ref<string[]>([])

const normalize = (s: AutoTransitSettings): AutoTransitSettings => ({
  guaranteeTypeCode: s.guaranteeTypeCode ?? null,
  guaranteeBasisCode: s.guaranteeBasisCode ?? null,
  aeoCertificateNumber: s.aeoCertificateNumber ?? null,
  aeoCertificateDate: s.aeoCertificateDate ?? null,
  doc44Template: (Array.isArray(s.doc44Template) ? s.doc44Template : []).map((d) => ({ code: d.code ?? '', name: d.name ?? '', fileKind: d.fileKind ?? null })),
})
const apply = (s: AutoTransitSettings) => {
  if (s.contractTemplate !== undefined) contract.value = s.contractTemplate ?? null
  if (Array.isArray(s.contractKeys)) contractKeys.value = s.contractKeys
  draft.value = normalize(s)
  saved.value = JSON.stringify(draft.value)
  errors.value = {}
}
const load = async () => {
  state.value = 'loading'
  try {
    apply(await getSettings())
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const trimOrNull = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null)
/** Тело PUT: строки без краевых пробелов, пустое — null. */
const body = (d: AutoTransitSettings): AutoTransitSettings => ({
  guaranteeTypeCode: trimOrNull(d.guaranteeTypeCode),
  guaranteeBasisCode: trimOrNull(d.guaranteeBasisCode),
  aeoCertificateNumber: trimOrNull(d.aeoCertificateNumber),
  aeoCertificateDate: d.aeoCertificateDate || null,
  doc44Template: d.doc44Template.map((x) => ({ code: x.code.trim(), name: x.name.trim(), fileKind: x.fileKind ?? null })),
})
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== saved.value)

const { guaranteeTypes } = useLocalOptions()
const FILE_KINDS: Doc44FileKind[] = ['cmr', 'invoice', 'packing', 'passport']
const baseKindOptions = computed<ZOption[]>(() => FILE_KINDS.map((k) => ({ value: k, label: t(`${S}.fileKinds.${k}`) })))
/**
 * Варианты строки: четыре вида контракта и, если в строке другой вид (сервер принимает и виды файлов модуля —
 * packingList, vehiclePassport, td…), — он же, подписанный как вид файла модуля. Иначе выбор показал бы «не задан», а
 * сохранение стёрло бы значение (ревью этапа 1, M7).
 */
const fileKindOptions = (current: string | null): ZOption[] => {
  if (!current || (FILE_KINDS as string[]).includes(current)) return baseKindOptions.value
  const key = `broker.autoTransit.file.kind.${current}`
  return [...baseKindOptions.value, { value: current, label: te(key) ? t(key) : current }]
}
/** Как на сервере: не больше 30 строк шаблона (ревью этапа 1, M1). */
const MAX_ROWS = 30

const addRow = () => { if (draft.value && draft.value.doc44Template.length < MAX_ROWS) draft.value.doc44Template.push({ code: '', name: '', fileKind: null }) }
const removeRow = (i: number) => { draft.value?.doc44Template.splice(i, 1) }
const setKind = (i: number, v: unknown) => {
  const row = draft.value?.doc44Template[i]
  if (row) row.fileKind = typeof v === 'string' && v ? v : null
}
const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))

const validate = (d: AutoTransitSettings): Record<string, string> => {
  const e: Record<string, string> = {}
  d.doc44Template.forEach((x, i) => {
    if (!/^\d{5}$/.test(x.code.trim())) e[`doc44Template.${i}.code`] = t(`${S}.codeInvalid`)
    if (!x.name.trim()) e[`doc44Template.${i}.name`] = t(`${S}.nameRequired`)
  })
  return e
}

const save = async () => {
  const d = draft.value
  if (!d || !canEdit.value || saving.value || !dirty.value) return
  const local = validate(d)
  errors.value = local
  if (Object.keys(local).length) return
  saving.value = true
  try {
    apply(await saveSettings(body(d)))
    message.success(t(`${S}.saved`))
  } catch (e) {
    const fe = fieldErrorsOf(e)
    errors.value = fe
    const conflict = (e as { response?: { status?: number } })?.response?.status === 409
    if (!Object.keys(fe).length) message.error(t(conflict ? `${S}.conflict` : `${S}.saveError`))
  } finally {
    saving.value = false
  }
}
const reset = () => { if (saved.value) apply(JSON.parse(saved.value) as AutoTransitSettings) }

// ---- шаблон договора экспедиции ----
const MAX_TEMPLATE = 2 * 1024 * 1024
const fileInput = ref<HTMLInputElement | null>(null)
const contractBusy = ref(false)
const contractError = ref('')
const unknownKeys = ref<string[]>([])
/** «{{ключ}}» — собирается в коде: двойные скобки в шаблоне Vue — это интерполяция. */
const token = (k: string) => `${'{'.repeat(2)}${k}${'}'.repeat(2)}`
const keyHint = (k: string) => (te(`${S}.contractKeys.${k}`) ? t(`${S}.contractKeys.${k}`) : '')
const sizeText = (n: number) => {
  const mb = n >= 1024 * 1024
  return new Intl.NumberFormat(locale.value, { style: 'unit', unit: mb ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 })
    .format(mb ? n / 1024 / 1024 : Math.max(1, Math.round(n / 1024)))
}
const dateText = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
const contractLine = computed(() => contract.value
  ? t(`${S}.contractFile`, { name: contract.value.fileName, size: sizeText(contract.value.sizeBytes), date: dateText(contract.value.uploadedAtUtc) })
  : '')

const pickTemplate = () => { if (canEdit.value && !contractBusy.value) fileInput.value?.click() }
const onTemplate = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  contractError.value = ''
  unknownKeys.value = []
  if (!/\.docx$/i.test(file.name) || file.size > MAX_TEMPLATE) {
    contractError.value = t(`${S}.contractOnlyDocx`)
    return
  }
  contractBusy.value = true
  try {
    const info = await uploadContractTemplate(file)
    contract.value = { fileName: info.fileName, sizeBytes: info.sizeBytes, uploadedAtUtc: info.uploadedAtUtc }
    unknownKeys.value = info.unknownKeys ?? []
    message.success(t(`${S}.contractUploaded`))
  } catch (err) {
    const fe = fieldErrorsOf(err)
    contractError.value = fe.file ?? t(`${S}.contractUploadError`)
  } finally {
    contractBusy.value = false
  }
}
const removeTemplate = async () => {
  if (!canEdit.value || contractBusy.value) return
  const ok = await confirm({ title: t(`${S}.contractDelete`), content: t(`${S}.contractDeleteConfirm`), okText: t(`${S}.contractDelete`), danger: true })
  if (!ok) return
  contractBusy.value = true
  try {
    await deleteContractTemplate()
    contract.value = null
    unknownKeys.value = []
    message.success(t(`${S}.contractDeleted`))
  } catch {
    // общий тост — перехватчик
  } finally {
    contractBusy.value = false
  }
}
const downloadTemplate = async () => {
  try {
    const { blob, fileName } = await downloadContractTemplate()
    saveBlob(blob, contract.value?.fileName || fileName)
  } catch {
    // общий тост — перехватчик
  }
}

const groupTitle = 'm-0 text-[15px] leading-6 font-semibold text-ink'
const deleteBtn = 'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-11'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-auto-transit-settings>
    <div class="min-w-0">
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t(`${S}.title`) }}</h1>
      <p class="m-0 mt-1 max-w-[46rem] text-sm text-muted">{{ t(`${S}.lead`) }}</p>
      <p v-if="!canEdit" class="m-0 mt-1 text-sm text-ink-2" data-settings-readonly>{{ t(`${S}.readOnly`) }}</p>
    </div>

    <div v-if="state === 'error'" role="alert" class="flex max-w-[48rem] flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-settings-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${S}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-settings-retry @click="load">{{ t(`${S}.retry`) }}</ZButton>
    </div>
    <div v-else-if="state === 'loading' || !draft" class="max-w-[48rem] rounded-panel border border-line bg-surface p-5"><ZSkeleton :lines="6" height="18px" /></div>

    <form v-else class="flex max-w-[48rem] min-w-0 flex-col gap-5 rounded-panel border border-line bg-surface p-5 max-sm:p-4" novalidate data-settings-form @submit.prevent="save">
      <section class="flex min-w-0 flex-col gap-3" aria-labelledby="ats-guarantee">
        <h2 id="ats-guarantee" :class="groupTitle">{{ t(`${S}.groupGuarantee`) }}</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ZField :label="t(`${S}.guaranteeType`)" :error="errors.guaranteeTypeCode">
            <ZCombobox :value="draft.guaranteeTypeCode" :options="guaranteeTypes" allow-clear :disabled="!canEdit" class="max-sm:*:h-11" data-f="guaranteeTypeCode" @update:value="draft.guaranteeTypeCode = str($event)" />
          </ZField>
          <ZField :label="t(`${S}.guaranteeBasis`)" :error="errors.guaranteeBasisCode" :extra="t(`${S}.guaranteeBasisHint`)">
            <ZInput :value="draft.guaranteeBasisCode" mono :maxlength="10" :disabled="!canEdit" class="max-sm:h-11" data-f="guaranteeBasisCode" @update:value="draft.guaranteeBasisCode = str($event)" />
          </ZField>
          <ZField :label="t(`${S}.aeoNumber`)" :error="errors.aeoCertificateNumber">
            <ZInput :value="draft.aeoCertificateNumber" mono :maxlength="64" :disabled="!canEdit" class="max-sm:h-11" data-f="aeoCertificateNumber" @update:value="draft.aeoCertificateNumber = str($event)" />
          </ZField>
          <ZField :label="t(`${S}.aeoDate`)" :error="errors.aeoCertificateDate">
            <ZDate :value="draft.aeoCertificateDate" allow-clear :disabled="!canEdit" class="max-sm:h-11" data-f="aeoCertificateDate" @update:value="draft.aeoCertificateDate = $event" />
          </ZField>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 border-t border-line pt-5" aria-labelledby="ats-doc44">
        <h2 id="ats-doc44" :class="groupTitle">{{ t(`${S}.groupDoc44`) }}</h2>
        <p class="m-0 text-xs text-muted">{{ t(`${S}.doc44Hint`) }}</p>
        <p v-if="errors.doc44Template" class="m-0 text-sm text-tone-danger-fg" role="alert" data-doc44-error>{{ errors.doc44Template }}</p>
        <p v-if="!draft.doc44Template.length" class="m-0 text-sm text-ink-3" data-doc44-empty>{{ t(`${S}.empty`) }}</p>
        <ul v-else role="list" class="m-0 flex list-none flex-col gap-2.5 p-0">
          <li
            v-for="(row, i) in draft.doc44Template"
            :key="i"
            class="grid min-w-0 grid-cols-1 items-start gap-2 rounded-row border border-line p-3 sm:grid-cols-[7rem_minmax(0,1fr)_11rem_auto] sm:border-0 sm:p-0"
            data-doc44-row
          >
            <ZField :label="t(`${S}.code`)" :error="errors[`doc44Template.${i}.code`]">
              <ZInput v-model:value="row.code" mono :maxlength="5" :disabled="!canEdit" class="max-sm:h-11" data-f="code" />
            </ZField>
            <ZField :label="t(`${S}.name`)" :error="errors[`doc44Template.${i}.name`]">
              <ZInput v-model:value="row.name" :maxlength="300" :disabled="!canEdit" class="max-sm:h-11" data-f="name" />
            </ZField>
            <ZField :label="t(`${S}.fileKind`)" :error="errors[`doc44Template.${i}.fileKind`]">
              <ZSelect :value="row.fileKind" :options="fileKindOptions(row.fileKind)" allow-clear :disabled="!canEdit" :placeholder="t(`${S}.fileKindNone`)" class="max-sm:*:h-11" data-f="fileKind" @update:value="setKind(i, $event)" />
            </ZField>
            <button
              v-if="canEdit"
              type="button"
              :class="[deleteBtn, 'sm:mt-6 max-sm:justify-self-end']"
              :aria-label="t(`${S}.remove`, { n: i + 1 })"
              data-doc44-delete
              @click="removeRow(i)"
            ><PhX :size="16" aria-hidden="true" /></button>
          </li>
        </ul>
        <ZButton v-if="canEdit" size="sm" variant="ghost" class="self-start max-sm:h-11" :disabled="draft.doc44Template.length >= MAX_ROWS" data-doc44-add @click="addRow">
          <PhPlus :size="14" aria-hidden="true" />{{ t(`${S}.add`) }}
        </ZButton>
        <p v-if="canEdit && draft.doc44Template.length >= MAX_ROWS" class="m-0 text-xs text-muted" data-doc44-limit>{{ t(`${S}.rowsLimit`, { n: MAX_ROWS }) }}</p>
      </section>

      <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <ZButton variant="ghost" :disabled="!dirty || saving" class="max-sm:h-11 max-sm:flex-1" data-settings-reset @click="reset">{{ t(`${S}.reset`) }}</ZButton>
        <ZButton html-type="submit" variant="primary" :loading="saving" :disabled="!dirty" class="max-sm:h-11 max-sm:flex-1" data-settings-save>{{ t(`${S}.save`) }}</ZButton>
      </div>
    </form>

    <section
      v-if="state === 'ready' && draft"
      class="flex max-w-[48rem] min-w-0 flex-col gap-3 rounded-panel border border-line bg-surface p-5 max-sm:p-4"
      aria-labelledby="ats-contract"
      data-contract-template
    >
      <h2 id="ats-contract" :class="groupTitle">{{ t(`${S}.groupContract`) }}</h2>
      <p class="m-0 text-xs text-muted">{{ t(`${S}.contractHint`) }}</p>
      <p v-if="contract" class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]" data-contract-file>{{ contractLine }}</p>
      <p v-else class="m-0 text-sm text-ink-3" data-contract-none>{{ t(`${S}.contractNone`) }}</p>
      <p v-if="contractError" class="m-0 text-sm text-tone-danger-fg" role="alert" data-contract-error>{{ contractError }}</p>
      <p v-if="unknownKeys.length" class="m-0 text-sm text-tone-wait-fg" role="status" data-contract-unknown>
        {{ t(`${S}.contractUnknownKeys`, { keys: unknownKeys.map(token).join(', ') }) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <input
          ref="fileInput"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          class="hidden"
          data-contract-input
          @change="onTemplate"
        >
        <ZButton v-if="canEdit" size="sm" :loading="contractBusy" class="max-sm:h-11 max-sm:flex-1" data-contract-upload @click="pickTemplate">
          {{ t(contract ? `${S}.contractReplace` : `${S}.contractUpload`) }}
        </ZButton>
        <ZButton v-if="contract" size="sm" variant="ghost" class="max-sm:h-11 max-sm:flex-1" data-contract-download @click="downloadTemplate">
          {{ t(`${S}.contractDownload`) }}
        </ZButton>
        <ZButton v-if="canEdit && contract" size="sm" variant="ghost" :disabled="contractBusy" class="max-sm:h-11 max-sm:flex-1" data-contract-delete @click="removeTemplate">
          {{ t(`${S}.contractDelete`) }}
        </ZButton>
      </div>
      <div v-if="contractKeys.length" class="flex min-w-0 flex-col gap-1.5 border-t border-line pt-3">
        <h3 class="m-0 text-sm font-semibold text-ink">{{ t(`${S}.contractKeysTitle`) }}</h3>
        <ul role="list" class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="k in contractKeys" :key="k" class="flex min-w-0 flex-wrap gap-x-2 text-sm" data-contract-key>
            <code class="font-mono text-[13px] text-ink select-all">{{ token(k) }}</code>
            <span class="min-w-0 text-ink-3 [overflow-wrap:anywhere]">{{ keyHint(k) }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
