<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZField from '@/components/z/ZField.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTabs, { type ZTabItem } from '@/components/z/ZTabs.vue'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { ZOption } from '@/ui/options'
import TransitStatusModal from '../TransitStatusModal.vue'
import RecordHeader from './RecordHeader.vue'
import RecordNav from './RecordNav.vue'
import RecordSaveBar from './RecordSaveBar.vue'
import SectionCarriers from './sections/SectionCarriers.vue'
import SectionContainers from './sections/SectionContainers.vue'
import SectionDoc44 from './sections/SectionDoc44.vue'
import SectionGoods from './sections/SectionGoods.vue'
import SectionGuarantees from './sections/SectionGuarantees.vue'
import SectionMain from './sections/SectionMain.vue'
import SectionMisc from './sections/SectionMisc.vue'
import SectionOrganizations from './sections/SectionOrganizations.vue'
import SectionPackaging from './sections/SectionPackaging.vue'
import SectionPreceding from './sections/SectionPreceding.vue'
import SectionRow from './sections/SectionRow.vue'
import SectionSeals from './sections/SectionSeals.vue'
import SectionTransport from './sections/SectionTransport.vue'
import { provideRecordRefs } from './sections/refs'
import RecordComments from './tabs/RecordComments.vue'
import RecordDocuments from './tabs/RecordDocuments.vue'
import RecordHistory from './tabs/RecordHistory.vue'
import { useRecordPermissions } from './tabs/recordPermissions'
import { NEW_RECORD_ID, useTransitRecord } from './useTransitRecord'

// Запись транзита — страница /reestr/:id (/reestr/new — новая) вместо окна ReestrForm (редизайн, волна 4б,
// доска TransitRecord). Шапка, плашки ошибок, вкладки «Данные / Документы n / История статусов / Комментарии n»
// (?tab=, replace). «Данные»: меню разделов + 13 разделов, правят общий черновик (переход между вкладками правки
// не теряет). Вкладки смонтированы скрытыми (v-show) — счётчики видны сразу. Плашка сохранения — при правках
// (у новой — всегда), Ctrl/⌘+S; уход с правками спрашивает (useConfirm), beforeunload — при правках и сохранении.
// Загрузка и сохранение — useTransitRecord (полная запись и полное тело PUT, инцидент 08.10).
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const perms = useRecordPermissions()
const { confirm } = useConfirm()
provideRecordRefs()

// id держим и после ухода со страницы (params.id пропадает раньше, чем страница размонтируется) — иначе
// запись сбросилась бы под ещё видимой страницей.
const id = ref(String(route.params.id ?? ''))
watch(() => route.params.id, (v) => { if (typeof v === 'string' && v) id.value = v })

const rec = useTransitRecord(() => id.value)
const { entry, draft, clientId, loading, notFound, loadError, reloadError, saving, saveError, dirty, changed } = rec

const isNew = computed(() => id.value === NEW_RECORD_ID && !entry.value)
const canEdit = computed(() => perms.canEditData())
const isClient = computed(() => (auth.role ?? '').trim().toLowerCase() === 'client')
const fromMyDocuments = computed(() => route.query.from === 'my-documents')
const listPath = computed(() => (fromMyDocuments.value ? '/my-documents' : '/reestr'))

// Новую запись создаёт только тот, кто правит «Данные».
watch([id, canEdit], () => {
  if (id.value === NEW_RECORD_ID && !canEdit.value) void router.replace('/reestr')
}, { immediate: true })

// ---- Клиенты: имя в шапке и выбор у новой записи (тот же источник и условия, что были у окна) ----
const clients = ref<{ id: string; username: string }[]>([])
const clientOptions = computed<ZOption[]>(() => clients.value.map((c) => ({ value: c.id, label: c.username })))
onMounted(async () => {
  if (isClient.value) return
  try {
    clients.value = await reestrApi.listClientsForCreate()
  } catch {
    // тост показал перехватчик; шапка без имени клиента, у новой записи — пустой выбор
  }
})
// У новой записи клиент по умолчанию — первый вариант (как в прежнем окне).
watch([clientOptions, isNew, clientId], () => {
  if (isNew.value && clientId.value == null && clientOptions.value.length) clientId.value = String(clientOptions.value[0].value)
}, { immediate: true })
const clientName = computed(() => {
  const cid = entry.value?.clientId
  return cid ? clients.value.find((c) => c.id === cid)?.username ?? null : null
})
const clientTo = computed(() => (entry.value && !isClient.value && auth.hasPermission('clients.read') ? `/clients/${entry.value.clientId}` : null))

// ---- Вкладки (?tab=) ----
type Tab = 'data' | 'documents' | 'history' | 'comments'
const tabKeys = computed<Tab[]>(() => (isNew.value
  ? ['data']
  : ['data', 'documents', ...(perms.canSeeHistory() ? ['history' as const] : []), 'comments']))
const tab = computed<Tab>(() => {
  const q = route.query.tab
  return typeof q === 'string' && (tabKeys.value as string[]).includes(q) ? (q as Tab) : 'data'
})
const setTab = (k: string) => {
  const { tab: _drop, ...rest } = route.query
  void router.replace({ query: k === 'data' ? rest : { ...rest, tab: k } })
}
const docCount = ref<number>()
const commentCount = ref<number>()
watch(id, () => {
  docCount.value = undefined
  commentCount.value = undefined
})
const tabLabel = (k: Tab) => t(`broker.transitRecord.tabs.${k}`)
const tabItems = computed<ZTabItem[]>(() => tabKeys.value.map((k) => ({
  key: k,
  label: tabLabel(k),
  count: k === 'documents' ? docCount.value : k === 'comments' ? commentCount.value : undefined,
})))
const historyKey = ref(0)

// ---- Сохранение ----
const showSaveBar = computed(() => canEdit.value && (dirty.value || isNew.value || saving.value))
const onSave = async () => {
  if (!canEdit.value || saving.value || loading.value) return
  const startedOn = id.value
  const savedId = await rec.save()
  // Новая создана, а пользователь всё ещё на /reestr/new — адрес записи. Ушёл на другую — не трогаем.
  if (savedId && startedOn === NEW_RECORD_ID && id.value === NEW_RECORD_ID) {
    await router.replace({ path: `/reestr/${savedId}`, query: route.query })
  }
}
const onCancel = () => {
  if (isNew.value) void router.push(listPath.value)
  else rec.revert()
}
// Плашка ошибки сохранения скрывается при следующей правке (и при сохранении — это делает сам save).
watch([() => draft, clientId], () => { if (saveError.value) saveError.value = null }, { deep: true })

const onKey = (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
  if (e.code !== 'KeyS' && e.key.toLowerCase() !== 's') return
  if (!canEdit.value || !(entry.value || isNew.value)) return
  e.preventDefault()
  if (dirty.value || isNew.value) void onSave()
}
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!dirty.value && !saving.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

// ---- Защита правок ----
let leaving = false
const askLeave = () => confirm({
  title: t('transit.zakrytBezSohraneniyaTitle'),
  content: t('transit.zakrytBezSohraneniyaText'),
  okText: t('transit.zakrytBezSohraneniya'),
  cancelText: t('transit.vernutsyaKZapisi'),
  danger: true,
})
onBeforeRouteLeave(() => (leaving || !dirty.value ? true : askLeave()))
// Та же страница, другая запись (поиск, ссылка) — тоже уход; смена ?tab= и переход /new → созданная — нет.
onBeforeRouteUpdate((to) => {
  const next = String(to.params.id ?? '')
  if (next === String(route.params.id ?? '') || next === entry.value?.id) return true
  return leaving || !dirty.value ? true : askLeave()
})

// ---- Статус и удаление ----
const statusOpen = ref(false)
const statusEntries = computed(() => (entry.value ? [entry.value] : []))
const onStatusChanged = () => {
  historyKey.value += 1
  void rec.reload()
}
const onDelete = async () => {
  const e = entry.value
  if (!e) return
  const ok = await confirm({ title: t('transit.udalitEtuZapis'), okText: t('transit.udalit'), cancelText: t('transit.otmena'), danger: true })
  if (!ok) return
  try {
    await reestrApi.delete(e.id)
  } catch {
    return // тост показал перехватчик
  }
  message.success(t('transit.zapisUspeshnoUdalena'))
  leaving = true
  await router.push(listPath.value)
}

const deprecation = computed(() => entry.value?.deprecationWarning ?? null)
</script>

<template>
  <div class="flex flex-col gap-[18px]" data-record-page>
    <!-- Загрузка: скелетон по форме страницы -->
    <div v-if="loading" class="flex flex-col gap-[18px]" aria-busy="true" data-record-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="160px" height="13px" />
        <ZSkeleton width="min(320px, 80%)" height="28px" />
        <ZSkeleton width="min(460px, 90%)" height="14px" />
      </div>
      <ZSkeleton height="40px" />
      <div class="grid gap-7 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div class="max-lg:hidden"><ZSkeleton :lines="8" height="24px" /></div>
        <div class="flex flex-col gap-4">
          <ZSkeleton height="180px" />
          <ZSkeleton height="240px" />
        </div>
      </div>
    </div>

    <div v-else-if="notFound" class="rounded-panel border border-dashed border-line-strong" data-record-not-found>
      <ZEmpty :title="t('broker.transitRecord.page.notFound')" :hint="t('broker.transitRecord.page.notFoundHint')">
        <template #action>
          <RouterLink
            :to="listPath"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t('broker.transitRecord.page.toList') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else-if="loadError" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-record-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.transitRecord.page.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-record-retry @click="rec.load()">{{ t('broker.transitRecord.page.retry') }}</ZButton>
    </div>

    <template v-else-if="entry || (isNew && canEdit)">
      <RecordHeader
        :entry="entry"
        :client-name="clientName"
        :client-to="clientTo"
        :from-my-documents="fromMyDocuments"
        :can-change-status="!!entry && auth.hasPermission('status.change')"
        :can-delete="!!entry && auth.hasPermission('reestr.delete')"
        @status="statusOpen = true"
        @delete="onDelete"
      />

      <ZAlert v-if="reloadError" type="warning" show-icon :message="t('broker.transitRecord.page.reloadError')" data-record-reload-error>
        {{ t('broker.transitRecord.errors.stale') }}
        <template #action>
          <ZButton size="sm" class="max-sm:h-11" data-record-reload-retry @click="rec.reload()">{{ t('broker.transitRecord.page.retry') }}</ZButton>
        </template>
      </ZAlert>
      <ZAlert v-else-if="saveError" type="error" show-icon :message="t('transit.zapisNeSohranena')" data-record-save-error>
        {{ t('broker.transitRecord.page.saveErrorText', { reason: saveError }) }}
      </ZAlert>

      <ZTabs
        v-if="!isNew"
        variant="line"
        :active-key="tab"
        :items="tabItems"
        :aria-label="t('broker.transitRecord.page.tabsLabel')"
        data-record-tabs
        @change="setTab"
      />

      <div
        v-show="tab === 'data'"
        role="tabpanel"
        :aria-label="tabLabel('data')"
        class="grid items-start gap-x-7 gap-y-4 lg:grid-cols-[200px_minmax(0,1fr)]"
        data-record-panel="data"
      >
        <RecordNav :draft="draft" />
        <div class="flex min-w-0 flex-col gap-[18px]">
          <ZAlert v-if="deprecation" type="warning" show-icon data-record-deprecation>
            {{ t('broker.transitRecord.deprecation.text', { code: deprecation.deprecatedCode }) }}<template v-if="deprecation.sourceVersion">
              {{ t('broker.transitRecord.deprecation.since', { version: deprecation.sourceVersion }) }}</template>.
            <template v-if="deprecation.replacementCodes.length">
              {{ t('broker.transitRecord.deprecation.replacements') }}
              <span v-for="code in deprecation.replacementCodes" :key="code" class="mr-1.5 font-mono font-medium">{{ code }}</span>
            </template>
          </ZAlert>

          <SectionMain :draft="draft" :readonly="!canEdit">
            <template v-if="isNew && canEdit" #lead>
              <ZField :label="t('broker.transitRecord.page.client')" required class="max-w-[420px]">
                <ZSelect
                  :value="clientId"
                  :options="clientOptions"
                  show-search
                  :placeholder="t('broker.transitRecord.page.clientPlaceholder')"
                  class="max-sm:*:h-11"
                  data-record-client-select
                  @update:value="clientId = $event == null ? null : String($event)"
                />
              </ZField>
            </template>
          </SectionMain>
          <SectionRow :draft="draft" :readonly="!canEdit" />
          <SectionGoods :draft="draft" :readonly="!canEdit" />
          <SectionDoc44 :draft="draft" :readonly="!canEdit" />
          <SectionOrganizations :draft="draft" :readonly="!canEdit" />
          <SectionCarriers :draft="draft" :readonly="!canEdit" />
          <SectionTransport :draft="draft" :readonly="!canEdit" />
          <SectionSeals :draft="draft" :readonly="!canEdit" />
          <SectionContainers :draft="draft" :readonly="!canEdit" />
          <SectionPackaging :draft="draft" :readonly="!canEdit" />
          <SectionPreceding :draft="draft" :readonly="!canEdit" />
          <SectionGuarantees :draft="draft" :readonly="!canEdit" />
          <SectionMisc :draft="draft" :readonly="!canEdit" />
        </div>
      </div>

      <template v-if="entry && !isNew">
        <div v-show="tab === 'documents'" role="tabpanel" :aria-label="tabLabel('documents')" data-record-panel="documents">
          <RecordDocuments
            :reestr-id="entry.id"
            :status="entry.status"
            :dirty="dirty"
            @applied="rec.reload()"
            @count="docCount = $event"
          />
        </div>
        <div v-if="perms.canSeeHistory()" v-show="tab === 'history'" role="tabpanel" :aria-label="tabLabel('history')" data-record-panel="history">
          <RecordHistory :reestr-id="entry.id" :refresh-key="historyKey" />
        </div>
        <div v-show="tab === 'comments'" role="tabpanel" :aria-label="tabLabel('comments')" data-record-panel="comments">
          <RecordComments :reestr-id="entry.id" :readonly="!perms.canPostComment()" @count="commentCount = $event" />
        </div>
      </template>

      <RecordSaveBar
        v-if="showSaveBar"
        :changed="changed"
        :is-new="isNew"
        :saving="saving"
        :disabled="loading || saving"
        @cancel="onCancel"
        @save="onSave"
      />

      <TransitStatusModal v-model:open="statusOpen" :entries="statusEntries" @changed="onStatusChanged" />
    </template>
  </div>
</template>
