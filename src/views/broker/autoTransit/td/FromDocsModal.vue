<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { fromDocuments, getTruck, type FromDocumentsResult, type TruckFile } from '@/api/autoTransit'
import { MAX_FILES, MAX_TOTAL_BYTES, RECOGNIZED_KINDS, defaultSelected, fromDocsError, pickableFiles, type FromDocsError, type GoodsMode } from './fromDocs'

// «Заполнить из документов» (очередь 3, спека 5.2): шаг 1 — выбор файлов партии и общих файлов машины (по умолчанию
// CMR, инвойс, упаковочный; возвращённых нет; не больше 20 файлов и 60 МБ, как на сервере) → «Распознать»;
// шаг 2 — что распознано и, если в форме уже есть товары, «Заменить» или «Добавить» → «Подставить в форму».
// Само слияние и подтверждение замены — apply от страницы; в базу ничего не пишется. Ошибка сервиса выбор не сбрасывает.
const props = defineProps<{
  open: boolean
  truckId: string
  partyId: string
  /** Сколько товаров уже в форме: от этого зависит вопрос «заменить / добавить». */
  goodsInForm: number
  /** Подставить ответ в форму; false — пользователь не подтвердил замену (окно остаётся). */
  apply: (result: FromDocumentsResult, mode: GoodsMode) => Promise<boolean>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t, te } = useI18n()
const F = 'broker.autoTransit.td.fromDocs'

const step = ref<'pick' | 'result'>('pick')
const files = ref<TruckFile[]>([])
const filesState = ref<'loading' | 'ready' | 'error'>('loading')
const selected = ref<string[]>([])
const running = ref(false)
const error = ref<FromDocsError | null>(null)
const result = ref<FromDocumentsResult | null>(null)
const mode = ref<GoodsMode>('add')

let seq = 0
const loadFiles = async () => {
  const my = ++seq
  filesState.value = 'loading'
  try {
    const card = await getTruck(props.truckId, { silent: true })
    if (my !== seq) return
    files.value = pickableFiles(card.files, props.partyId)
    selected.value = defaultSelected(files.value)
    filesState.value = 'ready'
  } catch {
    if (my === seq) filesState.value = 'error'
  }
}
watch(() => props.open, (v) => {
  if (!v) return
  step.value = 'pick'
  error.value = null
  result.value = null
  mode.value = 'add'
  void loadFiles()
}, { immediate: true })

const groups = computed(() => [
  { key: 'party', title: t(`${F}.partyFiles`), items: files.value.filter((f) => f.partyId) },
  { key: 'truck', title: t(`${F}.truckFiles`), items: files.value.filter((f) => !f.partyId) },
].filter((g) => g.items.length))
const kindText = (f: TruckFile) => t(`broker.autoTransit.file.kind.${f.kind}`)
const recognized = (f: TruckFile) => RECOGNIZED_KINDS.includes(f.kind)
const isOn = (id: string) => selected.value.includes(id)
const toggle = (id: string, on: boolean) => {
  error.value = null
  if (on && !isOn(id) && selected.value.length < MAX_FILES) selected.value = [...selected.value, id]
  else if (!on) selected.value = selected.value.filter((x) => x !== id)
}
const totalBytes = computed(() => files.value.filter((f) => isOn(f.id)).reduce((s, f) => s + (f.sizeBytes || 0), 0))
const tooMany = computed(() => selected.value.length >= MAX_FILES)
const tooHeavy = computed(() => totalBytes.value > MAX_TOTAL_BYTES)
const canRun = computed(() => step.value === 'pick' && selected.value.length > 0 && !tooHeavy.value && !running.value)

const recognize = async () => {
  if (!canRun.value) return
  running.value = true
  error.value = null
  try {
    result.value = await fromDocuments(props.truckId, props.partyId, [...selected.value])
    step.value = 'result'
  } catch (e) {
    error.value = fromDocsError(e)
    // Файл удалили или вернули, пока окно было открыто: перечитать список.
    if (error.value.key === 'notFound') void loadFiles()
  } finally {
    running.value = false
  }
}
const errorText = computed(() => {
  const e = error.value
  if (!e) return ''
  const key = `${F}.error.${e.key}${e.key === 'busy' && e.params.min == null ? 'NoMin' : ''}${e.key === 'tooLarge' && e.params.mb == null ? 'NoMb' : ''}`
  return e.text ?? (te(key) ? t(key, e.params) : t(`${F}.error.service`))
})

const docGoods = computed(() => (Array.isArray(result.value?.data.goods) ? result.value!.data.goods.length : 0))
const askMode = computed(() => docGoods.value > 0 && props.goodsInForm > 0)
const summary = computed(() => {
  const r = result.value
  if (!r) return []
  const keys = new Set(r.filled.map((k) => k.split(/[.[]/)[0]!))
  const out: string[] = []
  if (keys.has('organizations')) out.push(t(`${F}.got.organizations`))
  if (keys.has('transit')) out.push(t(`${F}.got.transit`))
  if (docGoods.value) out.push(t(`${F}.got.goods`, { n: docGoods.value }))
  if (keys.has('vehicles')) out.push(t(`${F}.got.vehicles`))
  if (keys.has('doc44')) out.push(t(`${F}.got.doc44`))
  return out
})
const applying = ref(false)
const onApply = async () => {
  const r = result.value
  if (!r || applying.value) return
  applying.value = true
  try {
    if (await props.apply(r, askMode.value ? mode.value : 'add')) emit('update:open', false)
  } finally {
    applying.value = false
  }
}
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
</script>

<template>
  <ZModal
    :open="open"
    :title="t(`${F}.title`)"
    :footer="false"
    :width="600"
    data-from-docs-modal
    @update:open="emit('update:open', $event)"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <template v-if="step === 'pick'">
        <p class="m-0 text-sm text-ink-2">{{ t(`${F}.hint`) }}</p>
        <ZSkeleton v-if="filesState === 'loading'" :lines="3" height="40px" />
        <ZAlert v-else-if="filesState === 'error'" type="error" show-icon :message="t(`${F}.filesError`)">
          <template #action><ZButton size="sm" class="max-sm:h-11" data-from-docs-files-retry @click="loadFiles()">{{ t(`${F}.retry`) }}</ZButton></template>
        </ZAlert>
        <p v-else-if="!files.length" class="m-0 rounded-row border border-dashed border-line-strong px-3 py-3 text-sm text-ink-3" data-from-docs-empty>{{ t(`${F}.noFiles`) }}</p>
        <template v-else>
          <fieldset v-for="g in groups" :key="g.key" class="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" :data-from-docs-group="g.key">
            <legend class="mb-1 text-xs font-semibold tracking-[0.02em] text-muted uppercase">{{ g.title }}</legend>
            <div
              v-for="f in g.items"
              :key="f.id"
              class="flex min-h-10 min-w-0 items-center rounded-row border border-line px-3 py-1.5 max-sm:min-h-11"
              :data-from-docs-file="f.id"
            >
              <ZCheckbox
                :checked="isOn(f.id)"
                :disabled="!isOn(f.id) && tooMany"
                class="min-w-0 flex-1 [&>span]:min-w-0"
                :data-from-docs-check="f.id"
                @update:checked="toggle(f.id, !!$event)"
              >
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-sm text-ink" :title="f.fileName">{{ f.fileName }}</span>
                  <span class="text-xs text-muted">{{ kindText(f) }}<template v-if="!recognized(f)"> · {{ t(`${F}.notRecognized`) }}</template></span>
                </span>
              </ZCheckbox>
            </div>
          </fieldset>
          <p class="m-0 text-xs" :class="tooHeavy ? 'text-tone-danger-fg' : 'text-muted'" data-from-docs-total>
            {{ t(`${F}.selectedTotal`, { n: selected.length, max: MAX_FILES, mb: mb(totalBytes), maxMb: Math.round(MAX_TOTAL_BYTES / 1024 / 1024) }) }}
          </p>
        </template>
        <ZAlert v-if="error" type="error" show-icon data-from-docs-error>
          {{ errorText }}
          <ul v-if="error.warnings?.length" class="m-0 mt-1 pl-4 text-xs">
            <li v-for="(wn, i) in error.warnings" :key="i">{{ wn }}</li>
          </ul>
        </ZAlert>
        <div class="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
          <ZButton class="max-sm:h-11 max-sm:flex-1" @click="emit('update:open', false)">{{ t(`${F}.cancel`) }}</ZButton>
          <ZButton variant="primary" class="max-sm:h-11 max-sm:flex-1" :loading="running" :disabled="!canRun" data-from-docs-run @click="recognize">{{ t(`${F}.run`) }}</ZButton>
        </div>
        <p v-if="running" class="m-0 text-xs text-muted" role="status">{{ t(`${F}.running`) }}</p>
      </template>

      <template v-else-if="result">
        <p class="m-0 text-sm text-ink" data-from-docs-summary>
          {{ summary.length ? t(`${F}.got.title`, { list: summary.join(', ') }) : t(`${F}.got.nothing`) }}
        </p>
        <fieldset v-if="askMode" class="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" data-from-docs-mode>
          <legend class="mb-1 text-sm font-semibold text-ink">{{ t(`${F}.modeTitle`, { form: goodsInForm, docs: docGoods }) }}</legend>
          <label v-for="m in (['add', 'replace'] as GoodsMode[])" :key="m" class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-row border px-3 py-1.5 max-sm:min-h-11" :class="mode === m ? 'border-navy bg-sunken' : 'border-line'">
            <input v-model="mode" type="radio" name="from-docs-mode" :value="m" class="shrink-0 accent-navy" :data-from-docs-mode-option="m">
            <span class="text-sm text-ink">{{ t(`${F}.mode.${m}`) }}</span>
          </label>
        </fieldset>
        <p class="m-0 text-xs text-muted">{{ t(`${F}.mergeHint`) }}</p>
        <div class="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
          <ZButton class="max-sm:h-11 max-sm:flex-1" @click="step = 'pick'">{{ t(`${F}.back`) }}</ZButton>
          <ZButton variant="primary" class="max-sm:h-11 max-sm:flex-1" :loading="applying" data-from-docs-apply @click="onApply">{{ t(`${F}.apply`) }}</ZButton>
        </div>
      </template>
    </div>
  </ZModal>
</template>
