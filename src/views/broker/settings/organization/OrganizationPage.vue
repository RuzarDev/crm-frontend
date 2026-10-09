<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import SaveBar from '@/components/broker/SaveBar.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import { billingApi, type OrganizationSettings } from '@/api/billing'
import { extractServerText } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import { calendarLocale } from '@/ui/date'
import {
  BASIS_PRESETS, DEFAULT_BASIS, VAT_MAX, VAT_MIN, changedFields, changedSections, compact, formatSavedAt, groupIik,
  toForm, toPayload, validate, type FieldKey, type OrgForm,
} from './organization'

// «Организация» раздела «Настройки» (редизайн, волна 5б, доска Org): реквизиты, которые попадают в счета, акты,
// договоры и доверенности. Четыре секции (заголовок слева, поля справа); проверки на месте, ошибки под полями;
// правки копятся в черновике, панель внизу называет изменённые секции («Отменить» / «Сохранить»), при уходе —
// вопрос. Менять может finance.write | users.write | администратор (как сервер), остальным — только чтение.
// Запросы silent: ошибка показывается на странице одним сообщением.
const { t, locale } = useI18n()
const auth = useAuthStore()
const { confirm } = useConfirm()

const canEdit = computed(() => auth.hasPermission('finance.write') || auth.hasPermission('users.write'))

const org = useBlock(true, () => billingApi.organization({ silent: true }))
const savedMeta = ref<Pick<OrganizationSettings, 'updatedAtUtc' | 'updatedByName'> | null>(null)
const saved = ref<OrgForm>(toForm(null))
const draft = reactive<OrgForm>(toForm(null))
const touched = ref<Set<FieldKey>>(new Set())
const saving = ref(false)
const saveError = ref<string | null>(null)

// Основание: «устава» / «доверенности» или свой текст (тогда рядом поле ввода).
type BasisChoice = (typeof BASIS_PRESETS)[number] | 'custom'
const isPreset = (v: string): v is (typeof BASIS_PRESETS)[number] => (BASIS_PRESETS as readonly string[]).includes(v)
const basisChoice = ref<BasisChoice>(DEFAULT_BASIS)
const syncChoice = () => { basisChoice.value = isPreset(draft.directorBasis) ? draft.directorBasis : 'custom' }

const apply = (data: Partial<OrganizationSettings>) => {
  savedMeta.value = { updatedAtUtc: data.updatedAtUtc ?? null, updatedByName: data.updatedByName ?? null }
  saved.value = toForm(data)
  Object.assign(draft, toForm(data))
  touched.value = new Set()
  saveError.value = null
  syncChoice()
}
watch(() => org.data, (d) => { if (d) apply(d) }, { immediate: true })
onMounted(() => { void org.load() })

const changed = computed(() => new Set(changedFields(saved.value, draft)))
const dirty = computed(() => changed.value.size > 0)
const errors = computed(() => validate(draft))
const hasErrors = computed(() => Object.keys(errors.value).length > 0)
// Ошибку показываем у тронутого (ушли из поля / правили) поля — пустая свежая форма не «краснеет» целиком.
const errorOf = (k: FieldKey): string | undefined => {
  const code = errors.value[k]
  if (!code || !(touched.value.has(k) || changed.value.has(k))) return undefined
  return t(`broker.settings.organization.err.${code}`, { min: VAT_MIN, max: VAT_MAX })
}
const touch = (k: FieldKey) => { touched.value = new Set(touched.value).add(k) }

const set = <K extends FieldKey>(k: K, v: OrgForm[K]) => { draft[k] = v }
// Строка после исправления не изменилась (в БИК, уже набранном заглавными, вписали строчную) — Vue не перерисует
// <input>, и в DOM останется введённый символ. Сдвигаем значение и возвращаем — поле пересинхронизируется (как в ZPhone).
async function onText(k: TextKey, raw: string, map: (v: string) => string) {
  const next = map(raw)
  if (next === draft[k] && raw !== next) {
    draft[k] = `${next} ` as OrgForm[TextKey]
    await nextTick()
  }
  draft[k] = next as OrgForm[TextKey]
}
type TextKey = Exclude<FieldKey, 'vatPayer' | 'vatRate'>
// Общие привязки текстового поля; map — как исправить введённое (ИИК/БИК — верхний регистр), after — после ухода из поля.
const text = (k: TextKey, map: (v: string) => string = (v) => v, after?: () => void) => ({
  value: draft[k],
  disabled: !canEdit.value,
  'onUpdate:value': (v: string) => onText(k, v, map),
  onBlur: () => { touch(k); after?.() },
  'data-org': k,
})
const toUpper = (v: string) => v.toUpperCase()
const groupOnBlur = () => { if (/^[A-Z0-9]+$/.test(compact(draft.iik))) draft.iik = groupIik(draft.iik) }
const onBasisChoice = (v: unknown) => {
  if (v === 'custom') {
    basisChoice.value = 'custom'
    if (isPreset(draft.directorBasis)) draft.directorBasis = ''
  } else if (typeof v === 'string' && isPreset(v)) {
    basisChoice.value = v
    draft.directorBasis = v
  }
  touch('directorBasis')
}
const basisOptions = computed(() => [
  ...BASIS_PRESETS.map((v) => ({ value: v, label: v })),
  { value: 'custom', label: t('broker.settings.organization.basisCustom') },
])

// ---- Сохранение ----
const sectionNames = computed(() =>
  changedSections(saved.value, draft).map((s) => t(`broker.settings.organization.sections.${s}.title`).toLocaleLowerCase(locale.value)).join(', '))
const barText = computed(() => t('broker.settings.organization.bar.changed', { sections: sectionNames.value }))
const canSave = computed(() => canEdit.value && dirty.value && !hasErrors.value && !saving.value)

const cancel = () => {
  Object.assign(draft, saved.value)
  touched.value = new Set()
  saveError.value = null
  syncChoice()
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null
  try {
    const res = await billingApi.saveOrganization(toPayload(draft, savedMeta.value as OrganizationSettings | null), { silent: true })
    apply(res)
    message.success(t('broker.settings.organization.saved'))
  } catch (e) {
    saveError.value = extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? t('broker.settings.organization.saveFailed')
  } finally {
    saving.value = false
  }
}

// ---- Защита правок ----
const askLeave = () => confirm({
  title: t('broker.settings.organization.leave.title'),
  content: t('broker.settings.organization.leave.text'),
  okText: t('broker.settings.organization.leave.leave'),
  cancelText: t('broker.settings.organization.leave.stay'),
  danger: true,
})
onBeforeRouteLeave(() => (dirty.value && canEdit.value ? askLeave() : true))
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!(dirty.value && canEdit.value) && !saving.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// ---- Шапка ----
const hint = computed(() => {
  const name = saved.value.shortName.trim()
  return t(name ? 'broker.settings.organization.hintNamed' : 'broker.settings.organization.hint', { name })
})
const savedStamp = computed(() => {
  const at = formatSavedAt(savedMeta.value?.updatedAtUtc, calendarLocale(locale.value))
  if (!at) return ''
  const by = savedMeta.value?.updatedByName?.trim()
  return t(by ? 'broker.settings.organization.savedAtBy' : 'broker.settings.organization.savedAt', { at, name: by })
})

const showSkeleton = computed(() => org.loading && !org.data)
const showError = computed(() => org.error && !org.data && !org.loading)
const showForm = computed(() => !!org.data)

const sectionClass = 'grid gap-x-8 gap-y-4 border-t border-line py-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]'
const gridClass = 'grid grid-cols-2 gap-x-3.5 gap-y-4 max-sm:grid-cols-1'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-org-page>
    <div class="flex max-w-[60rem] flex-wrap items-start gap-x-4 gap-y-2">
      <div class="min-w-0">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.settings.organization.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-muted [overflow-wrap:anywhere]" data-org-hint>{{ hint }}</p>
      </div>
      <p v-if="savedStamp" class="m-0 ml-auto pt-1 text-[12.5px] text-muted [overflow-wrap:anywhere] max-sm:ml-0" data-org-saved>{{ savedStamp }}</p>
    </div>

    <div v-if="showError" role="alert" class="flex max-w-[60rem] flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-org-load-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.settings.organization.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-org-retry @click="org.load()">{{ t('broker.settings.organization.retry') }}</ZButton>
    </div>
    <div v-else-if="showSkeleton" class="max-w-[60rem] rounded-panel border border-line bg-surface p-5" data-org-skeleton>
      <ZSkeleton :lines="9" height="18px" />
    </div>

    <form v-else-if="showForm" class="max-w-[60rem]" novalidate data-org-form @submit.prevent="save()">
      <section :class="sectionClass" data-org-section="company">
        <div class="min-w-0">
          <h2 class="m-0 text-base font-semibold text-ink">{{ t('broker.settings.organization.sections.company.title') }}</h2>
          <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.settings.organization.sections.company.text') }}</p>
        </div>
        <div :class="gridClass">
          <ZField class="col-span-2 max-sm:col-span-1" :label="t('broker.settings.organization.companyName')" required :error="errorOf('companyName')">
            <ZInput v-bind="text('companyName')" />
          </ZField>
          <ZField :label="t('broker.settings.organization.shortName')" :error="errorOf('shortName')">
            <ZInput v-bind="text('shortName')" />
          </ZField>
          <ZField :label="t('broker.settings.organization.bin')" :error="errorOf('bin')">
            <ZInput v-bind="text('bin')" mono :maxlength="12" inputmode="numeric" />
          </ZField>
          <ZField class="col-span-2 max-sm:col-span-1" :label="t('broker.settings.organization.legalAddress')">
            <ZInput v-bind="text('legalAddress')" />
          </ZField>
        </div>
      </section>

      <section :class="sectionClass" data-org-section="signers">
        <div class="min-w-0">
          <h2 class="m-0 text-base font-semibold text-ink">{{ t('broker.settings.organization.sections.signers.title') }}</h2>
          <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.settings.organization.sections.signers.text') }}</p>
        </div>
        <div :class="gridClass">
          <ZField :label="t('broker.settings.organization.director')">
            <ZInput v-bind="text('directorName')" />
          </ZField>
          <ZField :label="t('broker.settings.organization.basis')" :error="basisChoice === 'custom' ? undefined : errorOf('directorBasis')">
            <ZSelect :value="basisChoice" :options="basisOptions" :disabled="!canEdit" data-org="directorBasisChoice" @update:value="onBasisChoice" />
          </ZField>
          <ZField v-if="basisChoice === 'custom'" class="col-span-2 max-sm:col-span-1" :label="t('broker.settings.organization.basisText')" required :error="errorOf('directorBasis')">
            <ZInput v-bind="text('directorBasis')" :placeholder="t('broker.settings.organization.basisPlaceholder')" />
          </ZField>
          <ZField :label="t('broker.settings.organization.accountant')">
            <ZInput v-bind="text('accountantName')" />
          </ZField>
          <ZField :label="t('broker.settings.organization.phone')">
            <ZPhone v-bind="text('phone')" />
          </ZField>
          <ZField class="col-span-2 max-sm:col-span-1" :label="t('broker.settings.organization.email')" :error="errorOf('email')">
            <ZInput v-bind="text('email')" type="email" autocomplete="off" />
          </ZField>
        </div>
      </section>

      <section :class="sectionClass" data-org-section="bank">
        <div class="min-w-0">
          <h2 class="m-0 text-base font-semibold text-ink">{{ t('broker.settings.organization.sections.bank.title') }}</h2>
          <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.settings.organization.sections.bank.text') }}</p>
        </div>
        <div :class="gridClass">
          <ZField class="col-span-2 max-sm:col-span-1" :label="t('broker.settings.organization.bank')">
            <ZInput v-bind="text('bank')" />
          </ZField>
          <ZField :label="t('broker.settings.organization.iik')" :error="errorOf('iik')">
            <ZInput v-bind="text('iik', toUpper, groupOnBlur)" mono :maxlength="30" />
          </ZField>
          <ZField :label="t('broker.settings.organization.bik')" :error="errorOf('bik')">
            <ZInput v-bind="text('bik', compact)" mono :maxlength="8" />
          </ZField>
          <ZField :label="t('broker.settings.organization.kbe')" :error="errorOf('kbe')">
            <ZInput v-bind="text('kbe')" mono :maxlength="2" inputmode="numeric" />
          </ZField>
        </div>
      </section>

      <section :class="sectionClass" data-org-section="vat">
        <div class="min-w-0">
          <h2 class="m-0 text-base font-semibold text-ink">{{ t('broker.settings.organization.sections.vat.title') }}</h2>
          <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.settings.organization.sections.vat.text') }}</p>
        </div>
        <div :class="gridClass">
          <ZField :label="t('broker.settings.organization.vatPayer')">
            <ZSwitch :checked="draft.vatPayer" :disabled="!canEdit" class="min-h-9" data-org="vatPayer" @update:checked="set('vatPayer', $event)">
              {{ t(draft.vatPayer ? 'broker.settings.organization.yes' : 'broker.settings.organization.no') }}
            </ZSwitch>
          </ZField>
          <ZField :label="t('broker.settings.organization.vatRate')" :error="draft.vatPayer ? errorOf('vatRate') : undefined">
            <ZNumber
              :value="draft.vatRate"
              :min="VAT_MIN"
              :max="VAT_MAX"
              :precision="0"
              :disabled="!canEdit || !draft.vatPayer"
              data-org="vatRate"
              @update:value="set('vatRate', $event)"
              @blur="touch('vatRate')"
            />
          </ZField>
        </div>
      </section>
    </form>

    <SaveBar
      v-if="showForm && canEdit && (dirty || saving)"
      :label="t('broker.settings.organization.bar.label')"
      :text="saveError ?? barText"
      :cancel-text="t('broker.settings.organization.bar.cancel')"
      :save-text="t('broker.settings.organization.bar.save')"
      :saving="saving"
      :can-save="canSave"
      @cancel="cancel()"
      @save="save()"
    />
  </div>
</template>
