<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCamera, PhPlus, PhWarningCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { UPLOAD_ACCEPT, type FileKind, type FilePatch, type Party, type TruckFile } from '@/api/autoTransit'
import { formatNumberIn } from '@/ui/number'
import FileChip from './FileChip.vue'
import { MISSING_UPLOAD, dateText, type TruckRights } from './truckView'

// Партия машины (макет 2): номер и получатель, состояние декларации («Не подана» / «Подана» / «ТД № …»),
// инвойс, места и брутто, стоимость, назначение; файлы партии и пунктиром — недостающие по блокерам; действия по правам.
// Загрузка прямо в партию (как в макете): пунктирный чип «нет …» — кнопка, открывает выбор файла / камеру и грузит
// с видом этого чипа; «+ файл» — сначала вид из короткого меню. Файлы идут той же очередью, что и остальные.
const props = defineProps<{
  /** id машины — для ссылки на страницу ТД партии. */
  truckId: string
  party: Party
  parties: Party[]
  files: TruckFile[]
  missing: string[]
  rights: TruckRights
  canDeleteThis: boolean
  busy?: boolean
  /** Загрузку сейчас начать нельзя (идёт другая правка). Пока идёт сама очередь — можно: она подхватит файлы. */
  uploadDisabled?: boolean
}>()
const emit = defineEmits<{
  edit: [party: Party]
  submit: [party: Party]
  unsubmit: [party: Party]
  td: [party: Party]
  remove: [party: Party]
  download: [file: TruckFile]
  patchFile: [file: TruckFile, patch: FilePatch]
  removeFile: [file: TruckFile]
  upload: [party: Party, files: File[], kind: FileKind, stamped: boolean]
}>()
const { t, locale } = useI18n()
const P = 'broker.autoTransit.party'

const num = (n: number, d = 0) => formatNumberIn(locale.value, n, d)
const dash = '—'
const submitted = computed(() => !!props.party.submittedAtUtc)
const hasTd = computed(() => !!props.party.tdNumber.trim())
const decl = computed(() => {
  if (hasTd.value) {
    const date = dateText(props.party.tdDate)
    return { tone: 'done' as const, text: date ? t(`${P}.tdDated`, { number: props.party.tdNumber, date }) : t(`${P}.td`, { number: props.party.tdNumber }) }
  }
  if (submitted.value) return { tone: 'submitted' as const, text: t(`${P}.submitted`) }
  return { tone: 'neutral' as const, text: t(`${P}.notSubmitted`) }
})
const recipient = computed(() => props.party.recipientName.trim() || t(`${P}.noRecipient`))
const invoice = computed(() => {
  const n = props.party.invoiceNumber.trim()
  const d = dateText(props.party.invoiceDate)
  return n ? (d ? `${n} · ${d}` : n) : dash
})
const placesGross = computed(() => (props.party.places || props.party.grossKg
  ? `${num(props.party.places)} / ${t(`${P}.kg`, { n: num(props.party.grossKg, 3) })}`
  : dash))
const value = computed(() => (props.party.value ? `${num(props.party.value, 2)} ${props.party.currency}`.trim() : dash))
const destination = computed(() => [props.party.destinationOfficeCode, props.party.destinationCountry].filter((s) => s.trim()).join(' · ') || dash)

const canSubmit = computed(() => props.rights.submit && !submitted.value)
const canUnsubmit = computed(() => props.rights.submit && submitted.value && !hasTd.value)
const canTd = computed(() => props.rights.td && submitted.value)
// ТД партии (очередь 2а): «Заполнить ТД» / «Открыть ТД» — страница формы; без права записи она откроется для чтения.
const tdPath = computed(() => `/auto-transit/${encodeURIComponent(props.truckId)}/parties/${encodeURIComponent(props.party.id)}/td`)
const tdMissingCount = computed(() => props.party.declarationMissingCount ?? 0)
const interest = computed(() => (props.party.importInterestAtUtc ? props.party.importInterestContact?.trim() ?? '' : null))

// ---- Загрузка в партию ----
const UPLOAD_KINDS: FileKind[] = ['invoice', 'packingList', 'cmr', 'td', 'other']
const kindItems = computed<ZDropdownItem[]>(() => UPLOAD_KINDS.map((k) => ({ key: k, label: t(`broker.autoTransit.file.kind.${k}`) })))
const picker = ref<HTMLInputElement | null>(null)
let pending: { kind: FileKind; stamped: boolean } | null = null
const pickFor = (kind: FileKind, stamped = false) => {
  if (props.uploadDisabled || !props.rights.upload) return
  pending = { kind, stamped }
  picker.value?.click()
}
const onMissing = (code: string) => {
  const m = MISSING_UPLOAD[code]
  if (m) pickFor(m.kind, !!m.stamped)
}
const onPicked = (e: Event) => {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  const p = pending
  pending = null
  if (p && files.length) emit('upload', props.party, files, p.kind, p.stamped)
}
const missingUploadable = (code: string) => props.rights.upload && !!MISSING_UPLOAD[code]
</script>

<template>
  <article class="flex min-w-0 flex-col gap-3 rounded-row border border-line p-3.5" :data-party-card="party.id">
    <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <h3 class="m-0 min-w-0 text-sm leading-5 font-semibold break-words text-ink" data-party-title>
        <span class="tabular-nums">{{ party.number }}</span> · {{ recipient }}
      </h3>
      <ZTag :tone="decl.tone" size="sm" data-party-decl>{{ decl.text }}</ZTag>
      <ZTag v-if="tdMissingCount > 0" tone="accent" size="sm" data-party-td-missing>{{ t(`${P}.tdMissing`, { n: tdMissingCount }) }}</ZTag>
      <template v-if="interest !== null">
        <ZTooltip :title="interest ? t(`${P}.importContact`, { contact: interest }) : ''">
          <span tabindex="0" class="rounded-pill outline-hidden focus-visible:shadow-focus" data-party-interest>
            <ZTag tone="info" size="sm">{{ t(`${P}.importInterest`) }}</ZTag>
          </span>
        </ZTooltip>
        <span v-if="interest" class="basis-full text-xs text-muted sm:hidden" data-party-interest-contact>{{ t(`${P}.importContact`, { contact: interest }) }}</span>
      </template>
    </div>

    <dl class="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      <div class="min-w-0">
        <dt class="text-xs leading-4 text-muted">{{ t(`${P}.invoice`) }}</dt>
        <dd class="m-0 truncate font-mono text-[13px] text-ink" data-party-invoice>{{ invoice }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs leading-4 text-muted">{{ t(`${P}.placesGross`) }}</dt>
        <dd class="m-0 truncate text-[13px] text-ink tabular-nums" data-party-places>{{ placesGross }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs leading-4 text-muted">{{ t(`${P}.value`) }}</dt>
        <dd class="m-0 truncate text-[13px] text-ink tabular-nums" data-party-value>{{ value }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs leading-4 text-muted">{{ t(`${P}.destination`) }}</dt>
        <dd class="m-0 truncate text-[13px] text-ink" data-party-destination>{{ destination }}</dd>
      </div>
    </dl>

    <ul v-if="files.length || missing.length" role="list" class="m-0 flex min-w-0 list-none flex-wrap gap-1.5 p-0" data-party-files>
      <li v-for="f in files" :key="f.id" class="min-w-0 max-w-full">
        <FileChip
          :file="f"
          :parties="parties"
          :can-patch="rights.patchFile"
          :can-delete="rights.deleteFile"
          :busy="busy"
          @download="emit('download', $event)"
          @patch="(file, patch) => emit('patchFile', file, patch)"
          @remove="emit('removeFile', $event)"
        />
      </li>
      <li v-for="code in missing" :key="code" class="min-w-0 max-w-full">
        <button
          v-if="missingUploadable(code)"
          type="button"
          class="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-row border border-dashed border-gold-line bg-gold-soft px-2.5 font-sans text-xs text-gold-ink outline-hidden hover:border-gold focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-11"
          :disabled="uploadDisabled"
          :aria-label="t(`${P}.missingUpload`, { what: t(`broker.autoTransit.blocker.${code}`) })"
          :data-party-missing="code"
          @click="onMissing(code)"
        >
          <PhWarningCircle :size="14" aria-hidden="true" class="shrink-0" />
          <span class="min-w-0 truncate">{{ t(`broker.autoTransit.blocker.${code}`) }}</span>
          <span class="inline-flex shrink-0 items-center gap-1 font-semibold" aria-hidden="true">· <PhCamera :size="14" />{{ t(`${P}.missingAction`) }}</span>
        </button>
        <span
          v-else
          class="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-row border border-dashed border-gold-line bg-gold-soft px-2.5 text-xs text-gold-ink"
          :data-party-missing="code"
        >
          <PhWarningCircle :size="14" aria-hidden="true" class="shrink-0" />
          <span class="min-w-0 truncate">{{ t(`broker.autoTransit.blocker.${code}`) }}</span>
        </span>
      </li>
    </ul>
    <p v-else class="m-0 text-xs text-ink-3">{{ t(`${P}.noFiles`) }}</p>
    <input
      v-if="rights.upload"
      ref="picker"
      type="file"
      class="hidden"
      tabindex="-1"
      aria-hidden="true"
      multiple
      :accept="UPLOAD_ACCEPT"
      data-party-upload-input
      @change="onPicked"
    >

    <div class="flex flex-wrap items-center gap-2">
      <RouterLink
        :to="tdPath"
        class="inline-flex h-7 items-center justify-center gap-1.5 rounded-field bg-sunken px-2.5 font-sans text-xs font-semibold whitespace-nowrap text-ink no-underline outline-hidden transition-[background-color] duration-150 hover:bg-line-strong focus-visible:shadow-focus motion-reduce:transition-none max-sm:h-11 max-sm:px-4"
        data-party-td-form
      >{{ party.hasDeclaration ? t(`${P}.openTd`) : t(`${P}.fillTd`) }}</RouterLink>
      <ZButton v-if="rights.editParty" size="sm" class="max-sm:h-11 max-sm:px-4" :disabled="busy" data-party-edit @click="emit('edit', party)">{{ t(`${P}.edit`) }}</ZButton>
      <template v-if="canSubmit">
        <ZTooltip v-if="rights.submitLocked" :title="t(`${P}.submitLocked`)">
          <span tabindex="0" class="rounded-field outline-hidden focus-visible:shadow-focus" data-party-submit-lock>
            <ZButton size="sm" variant="primary" disabled class="max-sm:h-11 max-sm:px-4" data-party-submit>{{ t(`${P}.submit`) }}</ZButton>
          </span>
        </ZTooltip>
        <ZButton v-else size="sm" variant="primary" class="max-sm:h-11 max-sm:px-4" :disabled="busy" data-party-submit @click="emit('submit', party)">{{ t(`${P}.submit`) }}</ZButton>
      </template>
      <span v-if="canSubmit && !rights.submitLocked" class="text-xs text-muted" data-party-submit-keden>{{ t(`${P}.submitKeden`) }}</span>
      <ZButton v-if="canUnsubmit" size="sm" variant="ghost" class="max-sm:h-11 max-sm:px-4" :disabled="busy" data-party-unsubmit @click="emit('unsubmit', party)">{{ t(`${P}.unsubmit`) }}</ZButton>
      <ZButton v-if="canTd" size="sm" class="max-sm:h-11 max-sm:px-4" :disabled="busy" data-party-td @click="emit('td', party)">{{ t(`${P}.tdNumber`) }}</ZButton>
      <ZDropdown v-if="rights.upload" :items="kindItems" @select="pickFor($event as FileKind)">
        <ZButton size="sm" variant="ghost" class="max-sm:h-11 max-sm:px-4" :disabled="uploadDisabled" :aria-label="t(`${P}.addFileLabel`, { n: party.number })" data-party-add-file>
          <PhPlus :size="14" aria-hidden="true" />{{ t(`${P}.addFile`) }}
        </ZButton>
      </ZDropdown>
      <ZButton v-if="canDeleteThis" size="sm" variant="danger-ghost" class="ml-auto max-sm:h-11 max-sm:px-4" :disabled="busy" data-party-delete @click="emit('remove', party)">{{ t(`${P}.delete`) }}</ZButton>
    </div>
    <p v-if="canSubmit && rights.submitLocked" class="m-0 text-xs text-muted sm:hidden" data-party-submit-hint>{{ t(`${P}.submitLocked`) }}</p>
  </article>
</template>
