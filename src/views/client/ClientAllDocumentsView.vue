<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhDownloadSimple, PhFileText } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { ZTone } from '@/components/z/ZTag.vue'
import { clientDocumentsApi, type ClientCaseFile } from '@/api/clientDocuments'
import { import40Api } from '@/api/import40'
import type { Import40DocumentDto } from '@/api/import40Contract'
import { useAuthStore } from '@/stores/auth'
import { localDate, validDate, type DocKind } from '@/views/client/company/company'
import {
  companyCard, FILE_FILTERS, fileKindKey, isFileFilter, normSearch, passesFilter, sortFiles,
  type CompanyCardReg, type CompanyCardStatus, type FileFilter,
} from '@/views/client/documents/documents'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { saveBlob } from '@/ui/download'
import { useBlock } from '@/views/home/useBlock'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// «Документы» клиента (/documents, редизайн, волна 2b, доска Documents): договор и доверенность компании
// карточками (ведут в «Мою компанию»), ниже — все файлы поставок: и загруженные клиентом, и выданные AQNIET.
// Поиск (?q=) и фильтр «чьи» (?from=) живут в адресе — replace: «Назад» уводит со страницы, а не листает буквы.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const docs = useBlock(true, () => clientDocumentsApi.list({ silent: true }))
void docs.load()

// Клиент с обоими модулями попадает в документы транзита только отсюда (в меню «Документы» ведёт сюда).
const hasTransit = computed(() => auth.clientHasModule('transit'))

// ---- Документы компании ----
const COMPANY_KINDS: DocKind[] = ['contract', 'poa']
const STATUS_TONE: Record<CompanyCardStatus, ZTone> = {
  effective: 'done', awaiting: 'wait', consumed: 'neutral', expired: 'neutral', revoked: 'danger', none: 'neutral',
}
// «Готово» — по серверу (can-create, общее состояние с плашкой и шагами «Моей компании»; перечитывает оболочка),
// иначе карточка «Действует» спорила бы с шагом «Нужна новая». Не загрузилось — судим по документам.
const registration = useClientRegistration()
const regOf = (kind: DocKind): CompanyCardReg | null => {
  if (!registration.loaded.value) return null
  return kind === 'contract'
    ? { done: registration.contractDone.value, awaitingUs: registration.contractAwaitingUs.value }
    : { done: registration.poaDone.value }
}
const companyCards = computed(() => COMPANY_KINDS.map((kind) => {
  const card = companyCard((docs.data?.company ?? []).filter((d) => d.kind === kind), regOf(kind))
  return { kind, ...card, title: cardTitle(kind, card.doc), meta: cardMeta(kind, card.doc) }
}))
function cardTitle(kind: DocKind, d: Import40DocumentDto | null) {
  return d ? t(`client.documents.company.${kind}No`, { no: `${d.number}/${d.year}` }) : t(`client.documents.company.${kind}`)
}
function cardMeta(kind: DocKind, d: Import40DocumentDto | null) {
  if (!d) return t(`client.documents.company.${kind}None`)
  return [
    t(d.isSingleUse ? 'client.company.doc.single' : 'client.company.doc.multi'),
    d.validUntilUtc ? t('client.documents.company.until', { date: validDate(d.validUntilUtc) }) : null,
  ].filter(Boolean).join(' · ')
}
const statusText = (s: CompanyCardStatus) =>
  s === 'none' ? t('client.documents.company.none') : t(`client.company.doc.status.${s}`)
const companyTo = (kind: DocKind) => ({ path: '/import-40/company', query: { step: kind } })

// ---- Поиск (?q=, replace) ----
const queryQ = () => (typeof route.query.q === 'string' ? route.query.q : '')
const q = ref(queryQ())
// Свои переходы ещё в пути: промежуточный ответ (после «a», когда набрано уже «ab») не должен откатывать поле.
let ownReplaces = 0
watch(() => route.query.q, () => {
  if (ownReplaces) return
  const v = queryQ()
  if (v !== q.value) q.value = v
})
const onSearch = async (v: string) => {
  q.value = v
  ownReplaces += 1
  try {
    await router.replace({ query: { ...route.query, q: v.trim() ? v : undefined } })
  } finally {
    ownReplaces -= 1
  }
}

// ---- Фильтр «Все / От AQNIET / Ваши» (?from=, по умолчанию «Все» — без параметра) ----
const filter = computed<FileFilter>(() => (isFileFilter(route.query.from) ? route.query.from : 'all'))
const setFilter = (f: FileFilter) => {
  if (f === filter.value) return
  void router.replace({ query: { ...route.query, from: f === 'all' ? undefined : f } })
}

const norm = normSearch
const needle = computed(() => norm(q.value))
const kindOf = (f: ClientCaseFile) => t(fileKindKey(f))
const allFiles = computed(() => sortFiles(docs.data?.files ?? []))
const rows = computed(() => {
  const n = needle.value
  return allFiles.value.filter((f) => passesFilter(f, filter.value)
    && (!n || [f.fileName, f.caseNumber, kindOf(f)].some((v) => norm(v).includes(n))))
})

const thisYear = new Date().getFullYear()
const dateOf = (f: ClientCaseFile) => localDate(f.createdAtUtc, new Date(f.createdAtUtc).getFullYear() !== thisYear)
const fromOf = (f: ClientCaseFile) => t(f.fromClient ? 'client.documents.files.you' : 'client.documents.files.aqniet')
const caseTo = (f: ClientCaseFile) => `/import-40/${encodeURIComponent(f.caseId)}`

const emptyKey = computed(() => {
  if (!allFiles.value.length) return 'none'
  if (needle.value) return 'search'
  return filter.value
})

// ---- Скачать: по одному файлу; HTTP-ошибку показывает общий перехватчик, здесь — только сбой без ответа ----
const busyId = ref<string | null>(null)
const download = async (f: ClientCaseFile) => {
  if (busyId.value) return
  busyId.value = f.id
  try {
    saveBlob(await import40Api.downloadFile(f.caseId, f.id), f.fileName)
  } catch (e: unknown) {
    if (!(e as { response?: unknown })?.response) message.error(t('client.documents.files.downloadError'))
  } finally {
    busyId.value = null
  }
}

const TABLE_SKELETON = ['52%', '64%', '44%', '58%', '48%']
const card = 'flex min-w-0 items-center gap-3.5 rounded-panel border border-line bg-surface px-[18px] py-4'
const th = 'border-0 border-b border-solid border-line px-[18px] py-3 text-left text-[12.5px] leading-5 font-semibold text-ink-3'
const td = 'border-0 border-t border-solid border-sunken px-[18px] py-3 align-middle'
const caseLink = 'rounded-[4px] font-mono text-[13.5px] text-zircon-ink no-underline outline-hidden hover:text-ink hover:underline focus-visible:shadow-focus'
// «Повторить» — sm на компьютере, на телефоне — палец (44px).
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
</script>

<template>
  <div class="flex flex-col gap-[22px]" data-client-documents>
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-0">
        <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('client.documents.title') }}</h1>
        <p class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]">{{ t('client.documents.subtitle') }}</p>
        <RouterLink
          v-if="hasTransit"
          to="/my-documents"
          class="mt-1.5 inline-flex items-center gap-1 rounded-[4px] text-sm font-medium text-zircon-ink no-underline outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11"
          data-docs-transit
        >
          {{ t('client.documents.transit') }}<PhArrowRight :size="14" aria-hidden="true" />
        </RouterLink>
      </div>
      <ZInput
        :value="q"
        type="search"
        allow-clear
        :placeholder="t('client.documents.search')"
        :aria-label="t('client.documents.searchLabel')"
        class="w-full max-sm:h-11 sm:ml-auto sm:w-[320px]"
        data-docs-search
        @update:value="onSearch"
      />
    </div>

    <!-- Загрузка: карточки компании и строки таблицы -->
    <div v-if="docs.loading" class="flex flex-col gap-[22px]" aria-busy="true" data-docs-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="140px" height="13px" />
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3">
          <div v-for="i in 2" :key="i" :class="card">
            <ZSkeleton width="38px" height="38px" />
            <div class="flex min-w-0 flex-1 flex-col gap-2"><ZSkeleton width="56%" height="15px" /><ZSkeleton width="72%" height="12px" /></div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="110px" height="13px" />
        <div class="flex flex-col gap-4 rounded-panel border border-line px-[18px] py-4">
          <div v-for="(w, i) in TABLE_SKELETON" :key="i" class="flex items-center gap-6">
            <div class="flex min-w-0 flex-1 flex-col gap-2"><ZSkeleton :width="w" height="14px" /><ZSkeleton width="38%" height="11px" /></div>
            <ZSkeleton width="96px" height="13px" class="max-sm:hidden" />
            <ZSkeleton width="56px" height="13px" />
          </div>
        </div>
      </div>
    </div>

    <!-- Ошибка -->
    <div v-else-if="docs.error" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-docs-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('client.documents.loadError') }}</p>
      <ZButton size="sm" :class="retry" data-docs-retry @click="docs.load()">{{ t('home.retry') }}</ZButton>
    </div>

    <template v-else>
      <!-- Документы компании -->
      <section aria-labelledby="docs-company" class="flex flex-col gap-2.5">
        <h2 id="docs-company" class="m-0 text-[13px] leading-5 font-semibold text-ink-2">{{ t('client.documents.company.title') }}</h2>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3">
          <RouterLink
            v-for="c in companyCards"
            :key="c.kind"
            :to="companyTo(c.kind)"
            :class="cn(card, 'text-ink no-underline outline-hidden transition-colors duration-150 ease-out hover:border-line-strong hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none')"
            :data-company-card="c.kind"
            :data-company-status="c.status"
          >
            <span
              aria-hidden="true"
              :class="cn(
                'flex size-[38px] flex-none items-center justify-center rounded-row',
                c.status === 'effective' || c.status === 'awaiting' ? 'bg-zircon-soft text-zircon-ink' : 'bg-sunken text-ink-2',
              )"
            ><PhFileText :size="18" /></span>
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] leading-[22px] font-semibold">{{ c.title }}</span>
              <span class="block text-[13.5px] leading-5 text-ink-3" data-company-meta>{{ c.meta }}</span>
              <span
                v-if="c.newAwaiting"
                class="mt-0.5 block text-[13px] leading-5 font-medium text-gold-ink"
                data-company-new
              >{{ t(`client.documents.company.newAwaiting.${c.kind}`) }}</span>
            </span>
            <ZTag :tone="STATUS_TONE[c.status]" class="flex-none" data-company-tag>{{ statusText(c.status) }}</ZTag>
          </RouterLink>
        </div>
      </section>

      <!-- По поставкам -->
      <section aria-labelledby="docs-files" class="flex flex-col gap-2.5">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="docs-files" class="m-0 text-[13px] leading-5 font-semibold text-ink-2">{{ t('client.documents.files.title') }}</h2>
          <div
            v-if="allFiles.length"
            role="group"
            :aria-label="t('client.documents.files.filterLabel')"
            class="inline-flex rounded-field bg-sunken p-0.5 max-sm:w-full sm:ml-auto"
          >
            <button
              v-for="f in FILE_FILTERS"
              :key="f"
              type="button"
              :aria-pressed="f === filter"
              :class="cn(
                'inline-flex h-7 cursor-pointer items-center justify-center rounded-[6px] border-0 px-3 font-sans text-sm outline-hidden max-sm:h-11 max-sm:flex-1',
                'transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
                f === filter ? 'bg-surface font-semibold text-ink shadow-raised' : 'bg-transparent text-ink-3 hover:text-ink',
              )"
              :data-docs-filter="f"
              @click="setFilter(f)"
            >{{ t(`client.documents.files.filter.${f}`) }}</button>
          </div>
        </div>

        <div v-if="!rows.length" class="rounded-panel border border-dashed border-line-strong" :data-docs-empty="emptyKey">
          <ZEmpty
            v-if="emptyKey === 'none'"
            :title="t('client.documents.files.empty')"
            :hint="t('client.documents.files.emptyHint')"
          >
            <template #action>
              <RouterLink
                to="/import-40"
                class="inline-flex h-10 items-center rounded-row bg-sunken px-4 text-sm font-semibold text-ink no-underline outline-hidden hover:bg-line-strong focus-visible:shadow-focus max-sm:h-11"
              >{{ t('client.documents.files.toShipments') }}</RouterLink>
            </template>
          </ZEmpty>
          <ZEmpty
            v-else-if="emptyKey === 'search'"
            :title="t('client.documents.files.nothing', { q: q.trim() })"
            :hint="t('client.documents.files.nothingHint')"
          />
          <ZEmpty v-else :title="t(`client.documents.files.emptyFrom.${emptyKey}`)" />
        </div>

        <template v-else>
          <!-- Компьютер и планшет: таблица -->
          <div class="overflow-x-auto rounded-panel border border-line max-md:hidden">
            <table class="w-full min-w-[640px] border-collapse text-sm text-ink" :aria-label="t('client.documents.files.tableLabel')">
              <thead>
                <tr>
                  <th scope="col" :class="th">{{ t('client.documents.files.col.doc') }}</th>
                  <th scope="col" :class="th">{{ t('client.documents.files.col.shipment') }}</th>
                  <th scope="col" :class="th">{{ t('client.documents.files.col.from') }}</th>
                  <th scope="col" :class="th">{{ t('client.documents.files.col.date') }}</th>
                  <th scope="col" :class="th"><span class="sr-only">{{ t('client.documents.files.col.action') }}</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(f, i) in rows" :key="f.id" :data-doc-row="f.id">
                  <td :class="cn(td, i === 0 && 'border-t-0', 'max-w-[320px]')">
                    <span class="block font-medium" data-doc-kind>{{ kindOf(f) }}</span>
                    <span class="block truncate text-[13px] leading-5 text-ink-3" :title="f.fileName" data-doc-name>{{ f.fileName }}</span>
                  </td>
                  <td :class="cn(td, i === 0 && 'border-t-0', 'whitespace-nowrap')">
                    <RouterLink :to="caseTo(f)" :class="caseLink" data-doc-case>{{ f.caseNumber }}</RouterLink>
                  </td>
                  <td :class="cn(td, i === 0 && 'border-t-0', 'whitespace-nowrap text-ink-2')" data-doc-from>{{ fromOf(f) }}</td>
                  <td :class="cn(td, i === 0 && 'border-t-0', 'whitespace-nowrap text-ink-3 tabular-nums')" data-doc-date>{{ dateOf(f) }}</td>
                  <td :class="cn(td, i === 0 && 'border-t-0', 'text-right')">
                    <ZButton
                      variant="link"
                      :loading="busyId === f.id"
                      :aria-label="t('client.documents.files.downloadLabel', { name: f.fileName })"
                      class="h-8 px-1 text-sm font-medium"
                      data-doc-download
                      @click="download(f)"
                    >{{ t('client.documents.files.download') }}</ZButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Телефон: карточки -->
          <ul role="list" class="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden" data-doc-cards>
            <li v-for="f in rows" :key="f.id" class="flex flex-col gap-2 rounded-panel border border-line bg-surface px-4 pt-3.5 pb-2" :data-doc-card="f.id">
              <div class="min-w-0">
                <span class="block text-[14.5px] leading-[22px] font-medium text-ink">{{ kindOf(f) }}</span>
                <span class="block truncate text-[13px] leading-5 text-ink-3" :title="f.fileName">{{ f.fileName }}</span>
                <span class="block text-[13px] leading-5 text-ink-3 tabular-nums">{{ fromOf(f) }} · {{ dateOf(f) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <RouterLink :to="caseTo(f)" :class="cn(caseLink, 'inline-flex min-h-11 items-center')">{{ f.caseNumber }}</RouterLink>
                <ZButton
                  variant="ghost"
                  :loading="busyId === f.id"
                  :aria-label="t('client.documents.files.downloadLabel', { name: f.fileName })"
                  class="h-11 px-3 text-sm font-medium text-zircon-ink"
                  @click="download(f)"
                >
                  <PhDownloadSimple :size="16" aria-hidden="true" />{{ t('client.documents.files.download') }}
                </ZButton>
              </div>
            </li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>
