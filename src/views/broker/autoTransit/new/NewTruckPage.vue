<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowLeft, PhCaretDown } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import * as api from '@/api/autoTransit'
import type { PrefillDto, TruckCreate } from '@/api/autoTransit'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { listPath } from '@/shell/listReturn'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { errorKey } from '../autoTransit'
import UploadButtons from '../truck/UploadButtons.vue'
import { upperCode } from '../truck/truckView'
import { fieldErrorsOf } from '../truck/useTruck'
import UploadQueueList from './UploadQueueList.vue'
import { useUploadQueue, type Rejected } from './useUploadQueue'

// «Новая машина» с телефона (задача 10, макет 3, левый экран): номер тягача → подстановка с прошлого раза
// (прицеп, водитель, перевозчик) → фото всех документов → «Готово, завести машину». Файлы выбираются ещё до того,
// как машина заведена; после создания уходят очередью по одному (связь на границе слабая). Если часть не загрузилась —
// страница остаётся привязанной к созданной машине (второй машины не будет) и даёт «Повторить».
const PREFILL_DEBOUNCE_MS = 400
const PREFILL_MIN = 4
const N = 'broker.autoTransit.new'
const F = 'broker.autoTransit.truck.fields'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const { confirm } = useConfirm()
const countries = useCountryAlpha2Options()
const canBorder = computed(() => auth.hasPermission('autotransit.border'))
const backTo = computed(() => listPath('autoTransit', '/auto-transit'))

// ---- Пост по умолчанию — последний, что выбирал этот пользователь ----
const postKey = () => `zircon.autoTransit.lastPost.${auth.userId ?? ''}`
const readPost = (): string => {
  try { return localStorage.getItem(postKey()) ?? '' } catch { return '' }
}
const savePost = (v: string) => {
  try { if (v) localStorage.setItem(postKey(), v) } catch { /* хранилище недоступно — не страшно */ }
}

// ---- Форма ----
type PrefillKey = Exclude<keyof PrefillDto, 'existingTruckId'>
type Key = PrefillKey | 'customsPostCode'
const PREFILL_KEYS: PrefillKey[] = ['plateCountry', 'trailerPlate', 'trailerCountry', 'driverName', 'driverDoc', 'carrierName', 'carrierCountry', 'carrierRegNumber']
const plate = ref('')
const form = reactive<Record<Key, string>>({
  plateCountry: '', trailerPlate: '', trailerCountry: '', driverName: '', driverDoc: '', carrierName: '',
  carrierCountry: '', carrierRegNumber: '', customsPostCode: readPost(),
})
/** Поля, исправленные руками, — подстановка их больше не трогает. */
const touched = new Set<Key>()
/** Поля, заполненные подстановкой, — следующая подстановка (другой номер) их заменяет или очищает. */
const autoFilled = new Set<Key>()
const setField = (k: Key, v: string) => {
  touched.add(k)
  form[k] = k.endsWith('Country') ? upperCode(v, 2) : v
}
const errors = ref<Record<string, string>>({})

const detailsOpen = ref(true)
let detailsToggled = false
const toggleDetails = () => {
  detailsToggled = true
  detailsOpen.value = !detailsOpen.value
}

// ---- Подстановка по номеру ----
const remembered = ref<PrefillDto | null>(null)
const existingId = ref<string | null>(null)
const force = ref(false)
let prefillSeq = 0
let debounce: ReturnType<typeof setTimeout> | undefined
const created = ref<string | null>(null)
let alive = true

const EMPTY_PREFILL: PrefillDto = {
  existingTruckId: null, trailerPlate: null, trailerCountry: null, plateCountry: null, driverName: null, driverDoc: null,
  carrierName: null, carrierCountry: null, carrierRegNumber: null,
}
const hasMemory = (p: PrefillDto) => PREFILL_KEYS.some((k) => !!p[k])
const applyPrefill = (p: PrefillDto) => {
  for (const k of PREFILL_KEYS) {
    if (touched.has(k)) continue
    const v = p[k]
    if (v) {
      form[k] = v
      autoFilled.add(k)
    } else if (autoFilled.has(k)) {
      form[k] = ''
      autoFilled.delete(k)
    }
  }
  remembered.value = hasMemory(p) ? p : null
  if (!detailsToggled) detailsOpen.value = !remembered.value
  existingId.value = p.existingTruckId
}
const runPrefill = async (value: string) => {
  const my = ++prefillSeq
  try {
    const p = await api.prefill(value)
    if (!alive || my !== prefillSeq || created.value) return
    applyPrefill(p)
  } catch {
    // подстановка — удобство: ошибка молча
  }
}
watch(plate, (v) => {
  if (debounce !== undefined) clearTimeout(debounce)
  debounce = undefined
  prefillSeq++ // ответ по прежнему номеру уже не нужен
  force.value = false
  existingId.value = null
  const value = v.trim()
  if (created.value) return
  if (value.replace(/\s+/g, '').length < PREFILL_MIN) {
    // Номер стёрли — подставленное с прошлого раза убираем (исправленное руками остаётся).
    if (remembered.value || autoFilled.size) applyPrefill(EMPTY_PREFILL)
    return
  }
  debounce = setTimeout(() => {
    debounce = undefined
    void runPrefill(value)
  }, PREFILL_DEBOUNCE_MS)
})
const memoryText = computed(() => {
  const p = remembered.value
  if (!p) return ''
  const parts = [
    p.trailerPlate ? t(`${N}.part.trailer`, { v: p.trailerPlate }) : '',
    p.driverName ? t(`${N}.part.driver`, { v: p.driverName }) : '',
    p.carrierName ? t(`${N}.part.carrier`, { v: p.carrierName }) : '',
  ].filter(Boolean)
  return parts.length ? t(`${N}.remembered`, { parts: parts.join(', ') }) : t(`${N}.rememberedOther`)
})
const openExisting = () => {
  if (existingId.value) void router.push({ name: 'auto-transit-truck', params: { id: existingId.value } })
}
const addAnother = () => {
  force.value = true
  existingId.value = null
}

// ---- Файлы ----
// Все файлы загружены (после создания или после «Повторить») — в карточку машины.
const queue = useUploadQueue(() => created.value, {
  onIdle: () => {
    const id = created.value
    if (id && !queue.pending.value && !queue.failedCount.value) goTruck(id)
  },
})
const rejected = ref<Rejected[]>([])
const MAX_MB = Math.round(api.UPLOAD_MAX_BYTES / 1024 / 1024)
const onFiles = (files: File[]) => {
  rejected.value = queue.add(files)
  if (created.value) finishUploads()
}

// ---- Создание и загрузка ----
const creating = ref(false)
let leaving = false
const goTruck = (id: string) => {
  leaving = true
  void router.replace({ name: 'auto-transit-truck', params: { id } })
}
const finishUploads = () => { void queue.start() }
/** Убрали последние упавшие файлы — грузить больше нечего, машина уже заведена: в карточку. */
const removeFile = (index: number) => {
  queue.remove(index)
  const id = created.value
  if (id && !queue.running.value && !queue.pending.value && !queue.failedCount.value) goTruck(id)
}
const bodyOf = (): TruckCreate => {
  const body: TruckCreate = { plate: plate.value.trim().toUpperCase() }
  for (const k of [...PREFILL_KEYS, 'customsPostCode'] as Key[]) {
    const v = form[k].trim()
    if (v) body[k] = k === 'trailerPlate' || k === 'customsPostCode' ? v.toUpperCase() : v
  }
  if (force.value) body.force = true
  return body
}
const canSubmit = computed(() => !!plate.value.trim() && !creating.value && !created.value)
const submit = async () => {
  if (!canSubmit.value) return
  if (debounce !== undefined) clearTimeout(debounce)
  debounce = undefined
  prefillSeq++
  creating.value = true
  errors.value = {}
  try {
    const c = await api.createTruck(bodyOf())
    if (!alive) return
    created.value = c.id
    savePost(form.customsPostCode.trim().toUpperCase())
    if (!queue.pending.value) goTruck(c.id)
    else finishUploads()
  } catch (e) {
    if (!alive) return
    const res = (e as { response?: { status?: number; data?: Record<string, unknown> } })?.response
    if (res?.status === 409 && res.data?.code === 'duplicate_plate') {
      existingId.value = typeof res.data.existingTruckId === 'string' ? res.data.existingTruckId : null
      force.value = false
    } else if (res?.status === 409) {
      message.error(t(errorKey(String(res.data?.code ?? ''))))
    } else if (res?.status === 400) {
      errors.value = fieldErrorsOf(e)
      if (!Object.keys(errors.value).length) {
        const general = res.data?.error
        message.error(typeof general === 'string' && general ? general : t('broker.autoTransit.error.unknown'))
      } else if (Object.keys(errors.value).some((k) => k !== 'plate')) {
        detailsOpen.value = true
      }
    }
  } finally {
    if (alive) creating.value = false
  }
}

const uploadingMode = computed(() => !!created.value && (queue.running.value || queue.pending.value > 0))
const failedMode = computed(() => !!created.value && !queue.running.value && !queue.pending.value && queue.failedCount.value > 0)
const totalCount = computed(() => queue.items.value.length)
const goAnyway = async () => {
  const id = created.value
  if (!id) return
  const ok = await confirm({
    title: t(`${N}.goConfirm.title`),
    content: t(`${N}.goConfirm.text`, { n: queue.failedCount.value }),
    okText: t(`${N}.goConfirm.ok`),
    cancelText: t(`${N}.goConfirm.cancel`),
  })
  if (ok && alive) goTruck(id)
}

// ---- Уход со страницы, пока файлы не загружены ----
const unsaved = () => queue.pending.value > 0
onBeforeRouteLeave(() => {
  if (leaving || !unsaved()) return true
  return confirm({
    title: t(`${N}.leave.title`),
    content: t(created.value ? `${N}.leave.uploading` : `${N}.leave.notCreated`),
    okText: t(`${N}.leave.ok`),
    cancelText: t(`${N}.leave.stay`),
    danger: true,
  })
})
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!unsaved()) return
  e.preventDefault()
  e.returnValue = ''
}

const plateInput = ref<InstanceType<typeof ZInput> | null>(null)
onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  plateInput.value?.focus()
})
onBeforeUnmount(() => {
  alive = false
  if (debounce !== undefined) clearTimeout(debounce)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 max-w-[560px] flex-col gap-4" data-new-truck>
    <div class="flex min-w-0 flex-col gap-1">
      <RouterLink :to="backTo" class="inline-flex items-center gap-1 self-start rounded-field text-sm text-ink-2 no-underline outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11" data-new-back>
        <PhArrowLeft :size="14" aria-hidden="true" />{{ t(`${N}.back`) }}
      </RouterLink>
      <h1 class="m-0 text-xl font-semibold text-ink">{{ t(`${N}.title`) }}</h1>
    </div>

    <div v-if="!canBorder" class="rounded-panel border border-dashed border-line-strong" data-new-no-rights>
      <ZEmpty :title="t(`${N}.noRights`)" :hint="t(`${N}.noRightsHint`)">
        <template #action>
          <RouterLink :to="backTo" class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11">
            {{ t(`${N}.back`) }}
          </RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else class="flex min-w-0 flex-col gap-4" data-new-form>
      <ZField :label="t(`${F}.plate`)" required :error="errors.plate">
        <ZInput
          ref="plateInput"
          v-model:value="plate"
          mono
          :maxlength="30"
          :disabled="!!created"
          :placeholder="t(`${N}.platePlaceholder`)"
          autocomplete="off"
          autocapitalize="characters"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="next"
          class="h-14 text-xl [&_input]:uppercase [&_input]:placeholder:normal-case"
          data-new-plate
        />
      </ZField>

      <ZAlert v-if="existingId" type="warning" show-icon :message="t(`${N}.duplicate.title`)" data-new-duplicate>
        <p class="m-0">{{ t(`${N}.duplicate.text`) }}</p>
        <div class="mt-2.5 flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-2">
          <ZButton variant="primary" class="max-sm:h-11" data-new-open-existing @click="openExisting">{{ t(`${N}.duplicate.open`) }}</ZButton>
          <ZButton class="max-sm:h-11" data-new-add-another @click="addAnother">{{ t(`${N}.duplicate.force`) }}</ZButton>
        </div>
      </ZAlert>
      <ZAlert v-if="remembered && !existingId" type="info" show-icon data-new-remembered>
        <span class="break-words">{{ memoryText }}</span>
      </ZAlert>

      <section class="flex min-w-0 flex-col gap-3" data-new-details>
        <button
          type="button"
          class="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-field border-0 bg-transparent p-0 text-left text-sm font-semibold text-ink outline-hidden focus-visible:shadow-focus"
          :aria-expanded="detailsOpen"
          aria-controls="new-truck-details"
          data-new-details-toggle
          @click="toggleDetails"
        >
          <PhCaretDown :size="14" aria-hidden="true" class="shrink-0 transition-transform duration-150 motion-reduce:transition-none" :class="detailsOpen ? '' : '-rotate-90'" />
          {{ t(`${N}.details`) }}
        </button>
        <div v-show="detailsOpen" id="new-truck-details" class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" data-new-details-body>
          <ZField :label="t(`${F}.trailerPlate`)" :error="errors.trailerPlate">
            <ZInput :value="form.trailerPlate" mono :maxlength="30" :disabled="!!created" autocomplete="off" autocapitalize="characters" class="[&_input]:uppercase" data-new-field="trailerPlate" @update:value="setField('trailerPlate', $event)" />
          </ZField>
          <ZField :label="t(`${F}.trailerCountry`)" :error="errors.trailerCountry">
            <ZCombobox :value="form.trailerCountry" :options="countries" mono allow-clear :disabled="!!created" @update:value="setField('trailerCountry', $event)" />
          </ZField>
          <ZField :label="t(`${F}.driverName`)" :error="errors.driverName">
            <ZInput :value="form.driverName" :maxlength="300" :disabled="!!created" autocomplete="off" data-new-field="driverName" @update:value="setField('driverName', $event)" />
          </ZField>
          <ZField :label="t(`${F}.driverDoc`)" :error="errors.driverDoc">
            <ZInput :value="form.driverDoc" :maxlength="300" :disabled="!!created" autocomplete="off" data-new-field="driverDoc" @update:value="setField('driverDoc', $event)" />
          </ZField>
          <ZField :label="t(`${F}.carrierName`)" :error="errors.carrierName">
            <ZInput :value="form.carrierName" :maxlength="300" :disabled="!!created" autocomplete="off" data-new-field="carrierName" @update:value="setField('carrierName', $event)" />
          </ZField>
          <ZField :label="t(`${F}.carrierCountry`)" :error="errors.carrierCountry">
            <ZCombobox :value="form.carrierCountry" :options="countries" mono allow-clear :disabled="!!created" @update:value="setField('carrierCountry', $event)" />
          </ZField>
          <ZField :label="t(`${F}.carrierRegNumber`)" :error="errors.carrierRegNumber">
            <ZInput :value="form.carrierRegNumber" mono :maxlength="50" :disabled="!!created" autocomplete="off" data-new-field="carrierRegNumber" @update:value="setField('carrierRegNumber', $event)" />
          </ZField>
          <ZField :label="t(`${F}.plateCountry`)" :error="errors.plateCountry" :extra="t('broker.autoTransit.truck.countryHint')">
            <ZCombobox :value="form.plateCountry" :options="countries" mono allow-clear :disabled="!!created" @update:value="setField('plateCountry', $event)" />
          </ZField>
          <ZField :label="t(`${F}.customsPostCode`)" :error="errors.customsPostCode" :extra="t(`${N}.postHint`)">
            <ZInput :value="form.customsPostCode" mono :maxlength="20" :disabled="!!created" autocomplete="off" inputmode="numeric" data-new-field="customsPostCode" @update:value="setField('customsPostCode', $event)" />
          </ZField>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-2.5" aria-labelledby="new-truck-photos" data-new-photos>
        <h2 id="new-truck-photos" class="m-0 text-sm font-semibold text-ink">{{ t(`${N}.photos`) }}</h2>
        <UploadButtons size-check-off :disabled="creating" @files="onFiles" />
        <ul v-if="rejected.length" role="alert" class="m-0 flex list-none flex-col gap-1 p-0 text-xs text-tone-danger-fg" data-new-rejected>
          <li v-for="r in rejected" :key="r.name" class="min-w-0 break-words">
            {{ r.reason === 'tooBig' ? t(`${N}.rejected.tooBig`, { name: r.name, mb: MAX_MB }) : t(`${N}.rejected.badType`, { name: r.name }) }}
          </li>
        </ul>
        <UploadQueueList :items="queue.items.value" can-remove @retry="queue.retry" @remove="removeFile" />
        <p v-if="!queue.items.value.length" class="m-0 text-xs text-ink-3">{{ t(`${N}.photosHint`) }}</p>
      </section>

      <ZAlert v-if="failedMode" type="error" show-icon :message="t(`${N}.partial`, { n: queue.failedCount.value })" data-new-partial>
        {{ t(`${N}.partialHint`) }}
      </ZAlert>

      <div
        class="flex min-w-0 flex-col gap-2 max-sm:sticky max-sm:bottom-0 max-sm:z-[5] max-sm:-mx-4 max-sm:border-t max-sm:border-line max-sm:bg-surface max-sm:px-4 max-sm:pt-3 max-sm:pb-[max(12px,env(safe-area-inset-bottom))]"
        data-new-bar
      >
        <template v-if="failedMode">
          <ZButton variant="primary" block class="h-12 text-base" data-new-retry-all @click="queue.retryAll()">
            {{ t('broker.autoTransit.upload.retryAll', { n: queue.failedCount.value }) }}
          </ZButton>
          <ZButton block class="h-12 text-base" data-new-go-truck @click="goAnyway">{{ t(`${N}.goTruck`) }}</ZButton>
        </template>
        <ZButton
          v-else
          variant="primary"
          block
          class="h-12 text-base"
          :loading="creating || uploadingMode"
          :disabled="!canSubmit && !creating && !uploadingMode"
          data-new-submit
          @click="submit"
        >
          <span class="min-w-0 truncate">{{ uploadingMode ? t(`${N}.uploading`, { done: queue.doneCount.value, total: totalCount }) : t(`${N}.submit`) }}</span>
        </ZButton>
      </div>
    </div>
  </div>
</template>
