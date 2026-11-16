<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZPanel from '@/components/z/ZPanel.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import type { PartyFields } from '@/api/autoTransit'
import { listPath } from '@/shell/listReturn'
import { sinceText } from '../autoTransit'
import BlockersPanel from './BlockersPanel.vue'
import LinksModal from './LinksModal.vue'
import PartyCard from './PartyCard.vue'
import PartyModal from './PartyModal.vue'
import PrimaryBar from './PrimaryBar.vue'
import ProblemModal from './ProblemModal.vue'
import StageRail from './StageRail.vue'
import TdModal from './TdModal.vue'
import TruckEditModal from './TruckEditModal.vue'
import TruckFiles from './TruckFiles.vue'
import TruckHeader from './TruckHeader.vue'
import TruckJournal from './TruckJournal.vue'
import UploadButtons from './UploadButtons.vue'
import { useTruck } from './useTruck'
import { useTruckActions } from './useTruckActions'
import { missingFiles, railCells, rights as rightsOf } from './truckView'

// Карточка машины «Авто-транзита» (задача 9, макеты 2 и 3): шапка, этапы, партии, «Что мешает», общие документы,
// журнал. ≥ 1024 px — две колонки; уже — одна (что мешает, этапы, партии, документы, журнал), главная кнопка —
// липкая снизу. Права и состояния — truckView.rights; данные и правки — useTruck; окна и тосты — useTruckActions.
const { t } = useI18n()
const route = useRoute()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

let actions: ReturnType<typeof useTruckActions> | null = null
const s = useTruck(() => id.value, { paused: () => !!actions?.anyOpen() })
actions = useTruckActions(s, () => id.value)
const a = actions
const { card, loading, notFound, loadError, reloadError, busy, uploading } = s

const rights = computed(() => (card.value ? rightsOf(card.value) : null))
const parties = a.parties
const filesOf = (partyId: string | null) => (card.value?.files ?? []).filter((f) => f.partyId === partyId)
const canDeleteParty = (submitted: boolean) => !!rights.value?.deleteParty && !submitted && parties.value.length > 1

// «Идёт N мин» на текущем этапе пересчитывается раз в 30 с без запроса.
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => { clock = setInterval(() => { now.value = new Date() }, 30_000) })
onBeforeUnmount(() => { if (clock !== undefined) clearInterval(clock) })
const cells = computed(() => (card.value ? railCells(card.value, sinceText(card.value.stageSinceUtc, now.value, t), t) : []))

const uploader = ref<InstanceType<typeof UploadButtons> | null>(null)
const pickFiles = () => uploader.value?.openFiles()
const readonlyNote = computed(() => {
  const st = card.value?.status
  return st === 'released' ? t('broker.autoTransit.truck.readonlyReleased') : st === 'archived' ? t('broker.autoTransit.truck.readonlyArchived') : ''
})
const saveParty = (fields: PartyFields) => (a.partyEditing.value ? s.updateParty(a.partyEditing.value.id, fields) : s.addParty(fields))
const backTo = computed(() => listPath('autoTransit', '/auto-transit'))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-truck-page>
    <div v-if="loading && !card" class="flex flex-col gap-4" aria-busy="true" data-truck-skeleton>
      <ZSkeleton width="min(320px, 80%)" height="28px" />
      <ZSkeleton height="96px" />
      <ZSkeleton :lines="3" height="120px" />
    </div>

    <div v-else-if="notFound" class="rounded-panel border border-dashed border-line-strong" data-truck-not-found>
      <ZEmpty :title="t('broker.autoTransit.truck.notFound')" :hint="t('broker.autoTransit.truck.notFoundHint')">
        <template #action>
          <RouterLink :to="backTo" class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11">
            {{ t('broker.autoTransit.truck.toList') }}
          </RouterLink>
        </template>
      </ZEmpty>
    </div>

    <ZAlert v-else-if="loadError && !card" type="error" show-icon :message="t('broker.autoTransit.truck.loadError')" data-truck-load-error>
      <template #action><ZButton size="sm" class="max-sm:h-11" data-truck-retry @click="s.reload()">{{ t('broker.autoTransit.truck.retry') }}</ZButton></template>
    </ZAlert>

    <div v-else-if="card && rights" class="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-6">
      <TruckHeader :card="card" :rights="rights" :busy="busy" @links="a.linksOpen.value = true" @menu="a.onMenu" />
      <PrimaryBar
        v-if="a.primary.value"
        class="max-lg:order-last lg:col-start-2 lg:row-start-1 lg:justify-end"
        :primary="a.primary.value"
        :busy="busy"
        :loading="a.primaryRunning.value"
        :can-upload="rights.upload"
        @act="a.onPrimary(pickFiles)"
        @photos="a.upload"
      />

      <ZAlert v-if="card.status === 'problem'" class="lg:col-span-2" type="error" show-icon :message="t('broker.autoTransit.truck.problemBanner')" data-truck-problem>
        <span class="break-words whitespace-pre-line">{{ card.problemNote }}</span>
        <template v-if="rights.clearProblem" #action>
          <ZButton size="sm" class="max-sm:h-11" :disabled="busy" data-truck-clear-problem @click="a.clearProblem()">{{ t('broker.autoTransit.truck.clearProblem') }}</ZButton>
        </template>
      </ZAlert>
      <ZAlert v-if="readonlyNote" class="lg:col-span-2" type="info" show-icon :message="readonlyNote" data-truck-readonly />
      <ZAlert v-if="reloadError" class="lg:col-span-2" type="warning" show-icon :message="t('broker.autoTransit.truck.refreshError')" data-truck-refresh-error>
        <template #action><ZButton size="sm" class="max-sm:h-11" @click="s.reload()">{{ t('broker.autoTransit.truck.retry') }}</ZButton></template>
      </ZAlert>

      <div class="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div class="flex min-w-0 flex-col gap-4 max-lg:contents">
          <ZPanel class="max-lg:order-2" data-truck-rail-panel>
            <StageRail :cells="cells" />
          </ZPanel>
          <ZPanel class="max-lg:order-3" :title="t('broker.autoTransit.party.listTitle')" data-truck-parties>
            <template v-if="rights.addParty" #actions>
              <ZButton size="sm" class="max-sm:h-11" :disabled="busy" data-truck-add-party @click="a.newParty()">
                <PhPlus :size="14" aria-hidden="true" />{{ t('broker.autoTransit.truck.addParty') }}
              </ZButton>
            </template>
            <div class="flex flex-col gap-2.5">
              <PartyCard
                v-for="p in parties"
                :key="p.id"
                :party="p"
                :parties="parties"
                :files="filesOf(p.id)"
                :missing="missingFiles(card.blockers, p.id)"
                :rights="rights"
                :can-delete-this="canDeleteParty(!!p.submittedAtUtc)"
                :busy="busy"
                @edit="a.editParty"
                @submit="a.submit"
                @unsubmit="a.unsubmit"
                @td="a.openTd"
                @remove="a.removeParty"
                @download="a.download"
                @patch-file="a.patchFile"
                @remove-file="a.removeFile"
              />
            </div>
          </ZPanel>
        </div>
        <div class="flex min-w-0 flex-col gap-4 max-lg:contents">
          <BlockersPanel class="max-lg:order-1" :blockers="card.blockers" :parties="card.parties" />
          <ZPanel class="max-lg:order-4">
            <TruckFiles
              :files="filesOf(null)"
              :parties="parties"
              :has-any-files="card.files.length > 0"
              :rights="rights"
              :busy="busy"
              :uploading="uploading"
              :queue="s.queue.items.value"
              :zipping="a.zipping.value"
              @upload="a.upload"
              @zip="a.downloadZip"
              @download="a.download"
              @patch="a.patchFile"
              @remove="a.removeFile"
              @retry="s.retryUpload"
              @retry-all="s.retryAllUploads"
              @drop-upload="s.removeUpload"
            />
          </ZPanel>
          <ZPanel class="max-lg:order-5">
            <TruckJournal :events="card.events" :parties="card.parties" />
          </ZPanel>
        </div>
      </div>

      <UploadButtons v-if="rights.upload" ref="uploader" class="hidden" @files="a.upload" />
      <TruckEditModal v-model:open="a.editOpen.value" :card="card" :save="s.updateTruck" />
      <ProblemModal v-model:open="a.problemOpen.value" :save="s.setProblem" />
      <PartyModal v-model:open="a.partyOpen.value" :party="a.partyEditing.value" :save="saveParty" />
      <TdModal v-model:open="a.tdOpen.value" :party="a.tdParty.value" :save="(body) => s.setTd(a.tdParty.value!.id, body)" />
      <LinksModal v-if="rights.links" v-model:open="a.linksOpen.value" :truck-id="card.id" :plate="card.plate" :parties="card.parties" />
    </div>
  </div>
</template>
