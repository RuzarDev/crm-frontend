<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowLeft, PhCaretDown, PhCaretRight } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import type { DeclarationMissing } from '@/api/autoTransit'
import { useConfirm } from '@/ui/confirm'
import RecordNav from '@/views/broker/transit/record/RecordNav.vue'
import RecordSaveBar from '@/views/broker/transit/record/RecordSaveBar.vue'
import SectionCarriers from '@/views/broker/transit/record/sections/SectionCarriers.vue'
import SectionContainers from '@/views/broker/transit/record/sections/SectionContainers.vue'
import SectionDoc44 from '@/views/broker/transit/record/sections/SectionDoc44.vue'
import SectionGoods from '@/views/broker/transit/record/sections/SectionGoods.vue'
import SectionGuarantees from '@/views/broker/transit/record/sections/SectionGuarantees.vue'
import SectionMisc from '@/views/broker/transit/record/sections/SectionMisc.vue'
import SectionOrganizations from '@/views/broker/transit/record/sections/SectionOrganizations.vue'
import SectionPackaging from '@/views/broker/transit/record/sections/SectionPackaging.vue'
import SectionPreceding from '@/views/broker/transit/record/sections/SectionPreceding.vue'
import SectionSeals from '@/views/broker/transit/record/sections/SectionSeals.vue'
import SectionTransport from '@/views/broker/transit/record/sections/SectionTransport.vue'
import { provideRecordRefs } from '@/views/broker/transit/record/sections/refs'
import { sectionDomId } from '@/views/broker/transit/record/sections/sectionId'
import PlateTag from '../PlateTag.vue'
import TdSectionMain from './TdSectionMain.vue'
import { TD_SECTIONS, missingLabel, missingSection, missingTarget } from './tdModel'
import { useTd } from './useTd'

// ТД партии «Авто-транзита» — /auto-transit/:id/parties/:partyId/td (очередь 2а, спека 2026-11-17). Разделы — те же,
// что у записи ЖД-транзита (только импорт), «Основное» — своё (без станций и «Пост»), строки реестра нет.
// Шапка: госномер тягача и прицепа, партия, получатель, «Сохранить», «Назад к машине». Черновик (isDraft) помечен,
// «Не заполнено: N» — подсказка от сервера (сохранение не блокирует), клик ведёт к разделу и полю.
// Контейнеры — свёрнутым блоком в конце (у авто обычно не нужны). Уход с несохранённым спрашивает, beforeunload — тоже.
const { t, te } = useI18n()
const route = useRoute()
const { confirm } = useConfirm()
provideRecordRefs()

const T = 'broker.autoTransit.td'
const PAGE_ROUTE = 'auto-transit-td'
const q = (v: unknown) => (typeof v === 'string' ? v : '')
const truckId = ref(q(route.params.id))
const partyId = ref(q(route.params.partyId))
watch(() => (route.name === PAGE_ROUTE ? [route.params.id, route.params.partyId] as const : null), (v) => {
  if (!v) return
  truckId.value = q(v[0])
  partyId.value = q(v[1])
})

const td = useTd(() => truckId.value, () => partyId.value)
const { draft, response, readOnly, isDraft, missing, loading, notFound, loadError, reloading, saving, saveError, dirty, changed } = td

const truckPath = computed(() => `/auto-transit/${encodeURIComponent(truckId.value)}`)
const truck = computed(() => response.value?.truck ?? null)
const party = computed(() => response.value?.party ?? null)
const recipient = computed(() => party.value?.recipientName?.trim() || t('broker.autoTransit.party.noRecipient'))
const busy = computed(() => loading.value || saving.value || reloading.value)

// ---- Сохранение ----
const showSaveBar = computed(() => !readOnly.value && (dirty.value || isDraft.value || saving.value))
const onSave = async () => {
  if (readOnly.value || busy.value) return
  await td.save()
}
const onCancel = () => td.revert()
const saveErrorText = computed(() => (saveError.value ? t(`${T}.error.${saveError.value}`) : ''))
const canReload = computed(() => saveError.value === 'conflict' || saveError.value === 'submitted' || saveError.value === 'archived')

// ---- Только чтение ----
const readOnlyText = computed(() => (party.value?.submitted ? t(`${T}.readOnlySubmitted`) : t(`${T}.readOnly`)))

// ---- «Не заполнено» ----
const MISSING_SHOWN = 12
const missingAll = ref(false)
watch(missing, () => { missingAll.value = false })
const missingItems = computed(() => missing.value.map((m, i) => ({ m, i, text: labelOf(m) })))
const missingVisible = computed(() => (missingAll.value ? missingItems.value : missingItems.value.slice(0, MISSING_SHOWN)))
const missingMore = computed(() => Math.max(0, missingItems.value.length - MISSING_SHOWN))

function fieldName(field: string): string {
  const k = `${T}.missing.goodsField.${field}`
  return te(k) ? t(k) : field
}
function labelOf(m: DeclarationMissing): string {
  const { key, params } = missingLabel(m)
  if (key === 'goodsItem') return t(`${T}.missing.goodsItem`, { n: params.n as number, field: fieldName(String(params.field ?? '')) })
  const k = `${T}.missing.keys.${key}`
  if (te(k)) return t(k)
  // Сервер прислал ключ, которого фронт не знает: раздел и ключ как есть.
  return `${t(`broker.transitRecord.sections.${missingSection(m)}`)}: ${m.key}`
}

const containersOpen = ref(false)
watch(() => draft.containers.length, (n) => { if (n) containersOpen.value = true }, { immediate: true })

const goToMissing = async (m: DeclarationMissing) => {
  const section = missingSection(m)
  if (section === 'containers') containersOpen.value = true
  await nextTick()
  const el = document.getElementById(sectionDomId(section))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const { field, index } = missingTarget(m)
  if (!field) return
  const target = el.querySelectorAll<HTMLElement>(`[data-f="${field}"]`)[index]
  const focusable = target?.matches('input,button,textarea,[tabindex]')
    ? target
    : target?.querySelector<HTMLElement>('input,button,textarea,[tabindex]:not([tabindex="-1"])')
  focusable?.focus({ preventScroll: true })
}

// ---- Защита правок ----
const askLeave = () => confirm({
  title: t('broker.transitRecord.leave.title'),
  content: t('broker.transitRecord.leave.text'),
  okText: t('broker.transitRecord.leave.leave'),
  cancelText: t('broker.transitRecord.leave.stay'),
  danger: true,
})
onBeforeRouteLeave(() => (!dirty.value ? true : askLeave()))
onBeforeRouteUpdate((to) => {
  const same = q(to.params.id) === truckId.value && q(to.params.partyId) === partyId.value
  return same || !dirty.value ? true : askLeave()
})
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!dirty.value && !saving.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const backClass = 'inline-flex min-h-9 items-center gap-1.5 rounded-row text-[13px] font-medium text-ink-2 no-underline outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-[18px]" data-td-page>
    <div v-if="loading" class="flex flex-col gap-[18px]" aria-busy="true" data-td-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="140px" height="13px" />
        <ZSkeleton width="min(320px, 80%)" height="28px" />
      </div>
      <ZSkeleton height="180px" />
      <ZSkeleton height="240px" />
    </div>

    <div v-else-if="notFound" class="rounded-panel border border-dashed border-line-strong" data-td-not-found>
      <ZEmpty :title="t(`${T}.notFound`)" :hint="t(`${T}.notFoundHint`)">
        <template #action>
          <RouterLink
            :to="truckPath"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t(`${T}.back`) }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else-if="loadError" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-td-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${T}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11" data-td-retry @click="td.load()">{{ t(`${T}.retry`) }}</ZButton>
    </div>

    <template v-else-if="response">
      <header class="flex min-w-0 flex-col gap-2" data-td-header>
        <RouterLink :to="truckPath" :class="backClass" class="self-start" data-td-back>
          <PhArrowLeft :size="14" aria-hidden="true" />{{ t(`${T}.back`) }}
        </RouterLink>
        <div class="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3">
          <div class="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
            <h1 class="m-0 text-[22px] leading-7 font-semibold text-ink">{{ t(`${T}.title`) }}</h1>
            <p class="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-ink-2">
              <PlateTag v-if="truck?.plate" :plate="truck.plate" />
              <PlateTag v-if="truck?.trailerPlate" :plate="truck.trailerPlate" />
              <span class="min-w-0 [overflow-wrap:anywhere]">
                {{ t(`${T}.party`, { n: party?.number ?? '' }) }} · {{ recipient }}
              </span>
            </p>
          </div>
          <ZButton
            v-if="!readOnly"
            variant="primary"
            :loading="saving"
            :disabled="busy"
            class="max-sm:h-11 max-sm:w-full"
            data-td-save
            @click="onSave"
          >{{ t(`${T}.save`) }}</ZButton>
        </div>
      </header>

      <ZAlert v-if="isDraft" type="info" show-icon data-td-draft>{{ t(`${T}.draft`) }}</ZAlert>
      <ZAlert v-if="readOnly" type="info" show-icon data-td-readonly>{{ readOnlyText }}</ZAlert>
      <ZAlert v-if="saveError" type="error" show-icon :message="t(`${T}.notSaved`)" data-td-save-error>
        {{ saveErrorText }}
        <template v-if="canReload" #action>
          <ZButton size="sm" class="max-sm:h-11" :loading="reloading" data-td-reload @click="td.reload()">{{ t(`${T}.reload`) }}</ZButton>
        </template>
      </ZAlert>

      <section
        v-if="missing.length"
        class="flex min-w-0 flex-col gap-2 rounded-panel border border-gold-line bg-gold-soft px-4 py-3"
        aria-labelledby="td-missing-title"
        data-td-missing
      >
        <h2 id="td-missing-title" class="m-0 text-sm leading-5 font-semibold text-gold-ink" data-td-missing-title>
          {{ t(`${T}.missingTitle`, { n: missing.length }) }}
        </h2>
        <ul role="list" class="m-0 flex min-w-0 list-none flex-wrap gap-1.5 p-0">
          <li v-for="item in missingVisible" :key="`${item.i}-${item.m.key}`" class="min-w-0 max-w-full">
            <button
              type="button"
              class="inline-flex min-h-8 max-w-full cursor-pointer items-center rounded-row border border-gold-line bg-surface px-2.5 text-left font-sans text-xs text-ink outline-hidden hover:border-gold focus-visible:shadow-focus max-sm:min-h-11"
              data-td-missing-item
              @click="goToMissing(item.m)"
            ><span class="min-w-0 [overflow-wrap:anywhere]">{{ item.text }}</span></button>
          </li>
          <li v-if="missingMore && !missingAll">
            <button
              type="button"
              class="inline-flex min-h-8 cursor-pointer items-center rounded-row px-2 font-sans text-xs font-semibold text-gold-ink underline outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
              data-td-missing-more
              @click="missingAll = true"
            >{{ t(`${T}.missingMore`, { n: missingMore }) }}</button>
          </li>
        </ul>
        <p class="m-0 text-xs text-ink-2">{{ t(`${T}.missingHint`) }}</p>
      </section>

      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-7 gap-y-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <RecordNav :draft="draft" :sections="TD_SECTIONS" :label="t(`${T}.navLabel`)" />
        <div class="flex min-w-0 flex-col gap-[18px]">
          <div class="flex min-w-0 flex-col gap-[18px]" data-td-sections>
            <TdSectionMain :draft="draft" :readonly="readOnly" />
            <SectionOrganizations :draft="draft" :readonly="readOnly" />
            <SectionCarriers :draft="draft" :readonly="readOnly" />
            <SectionTransport :draft="draft" :readonly="readOnly" />
            <SectionSeals :draft="draft" :readonly="readOnly" />
            <SectionGoods :draft="draft" :readonly="readOnly" />
            <SectionDoc44 :draft="draft" :readonly="readOnly" />
            <SectionPackaging :draft="draft" :readonly="readOnly" />
            <SectionPreceding :draft="draft" :readonly="readOnly" />
            <SectionGuarantees :draft="draft" :readonly="readOnly" />
            <SectionMisc :draft="draft" :readonly="readOnly" />
          </div>

          <div class="flex min-w-0 flex-col gap-3 border-t border-line pt-4" data-td-containers>
            <button
              type="button"
              class="inline-flex min-h-9 cursor-pointer items-center gap-1.5 self-start rounded-row border-0 bg-transparent p-0 font-sans text-sm font-semibold text-ink-2 outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11"
              :aria-expanded="containersOpen"
              data-td-containers-toggle
              @click="containersOpen = !containersOpen"
            >
              <component :is="containersOpen ? PhCaretDown : PhCaretRight" :size="14" aria-hidden="true" />
              {{ t(`${T}.containers`, { n: draft.containers.length }) }}
            </button>
            <SectionContainers v-if="containersOpen" :draft="draft" :readonly="readOnly" />
          </div>
        </div>
      </div>

      <RecordSaveBar
        v-if="showSaveBar"
        :changed="changed"
        :is-new="isDraft"
        :saving="saving"
        :disabled="busy"
        @cancel="onCancel"
        @save="onSave"
      />
    </template>
  </div>
</template>
