<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { myPoasApi, type MyPoaRow } from '@/api/declarantProfile'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { docTag } from '@/views/broker/clients/clientCard'
import { validDate } from '@/views/client/company/company'
import ProfileCard from './ProfileCard.vue'
import { splitMyPoas } from './profileForms'

// «Мои доверенности» (02.11.2026, F2): доверенности клиентов, где ИИН сотрудника из его профиля — среди представителей
// (снимок на момент выпуска). Сначала действующие (и ждущие подписи), истекшие и отозванные — свёрнуты. «Скачать» —
// документ .docx для печати (с QR подписантов): ЭЦП-контейнер .cms Word не открывает, а КПП на границе нужен читаемый
// документ (ревью 02.11.2026); у подписанной рядом «Файл ЭЦП (.cms)». reloadKey меняется после сохранения профиля: ИИН
// мог появиться или поменяться.
const props = defineProps<{ reloadKey?: number }>()
const { t } = useI18n()

type State = 'loading' | 'error' | 'ready'
const state = ref<State>('loading')
const iinMissing = ref(false)
const items = ref<MyPoaRow[]>([])
const showPast = ref(false)
const busy = ref<string | null>(null)

const load = async () => {
  state.value = 'loading'
  try {
    const res = await myPoasApi.list({ silent: true })
    iinMissing.value = res.iinMissing
    items.value = res.items ?? []
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)
watch(() => props.reloadKey, () => { void load() })

const groups = computed(() => splitMyPoas(items.value))

const number = (r: MyPoaRow) => `${r.number}/${r.year}`
const sub = (r: MyPoaRow) => {
  const parts = [t('personal.profile.mypoas.issued', { date: validDate(r.generatedAtUtc) })]
  if (r.validUntilUtc) parts.push(t('personal.profile.mypoas.until', { date: validDate(r.validUntilUtc) }))
  return parts.join(' · ')
}

const download = async (r: MyPoaRow, docx: boolean) => {
  const key = `${r.id}:${docx ? 'docx' : 'cms'}`
  if (busy.value) return
  busy.value = key
  try {
    const { blob, fileName } = await myPoasApi.download(r.id, docx)
    saveBlob(blob, fileName)
  } catch {
    message.error(t('personal.profile.mypoas.downloadFailed'))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <ProfileCard :title="t('personal.profile.mypoas.title')" data-profile-card="mypoas">
    <div v-if="state === 'error'" role="alert" class="flex flex-wrap items-center gap-3 rounded-row bg-sunken px-4 py-3" data-mypoas-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('personal.profile.mypoas.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-mypoas-retry @click="load()">{{ t('personal.profile.retry') }}</ZButton>
    </div>
    <div v-else-if="state === 'loading'" data-mypoas-skeleton>
      <ZSkeleton :lines="2" height="36px" />
    </div>
    <p v-else-if="iinMissing" class="m-0 text-sm text-ink-2" data-mypoas-no-iin>{{ t('personal.profile.mypoas.noIin') }}</p>
    <p v-else-if="!items.length" class="m-0 text-sm text-muted" data-mypoas-empty>{{ t('personal.profile.mypoas.empty') }}</p>
    <template v-else>
      <p v-if="!groups.current.length" class="m-0 text-sm text-muted" data-mypoas-no-current>{{ t('personal.profile.mypoas.noCurrent') }}</p>
      <ul class="m-0 flex list-none flex-col divide-y divide-line p-0" data-mypoas-current>
        <li v-for="r in groups.current" :key="r.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0" :data-mypoa="r.id">
          <div class="min-w-0 flex-1">
            <p class="m-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]" data-mypoa-client>{{ r.clientName }}</p>
            <p class="m-0 text-[12.5px] text-ink-3"><span class="tabular-nums">№ {{ number(r) }}</span> · {{ sub(r) }}</p>
          </div>
          <ZTag :tone="docTag(r).tone" data-mypoa-status>{{ t(docTag(r).labelKey) }}</ZTag>
          <div class="flex gap-2">
            <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" :loading="busy === `${r.id}:docx`" data-mypoa-download @click="download(r, true)">{{ t('personal.profile.mypoas.download') }}</ZButton>
            <ZButton v-if="r.hasSignedFile" size="sm" variant="ghost" class="max-sm:h-11 max-sm:px-4" :loading="busy === `${r.id}:cms`" data-mypoa-cms @click="download(r, false)">{{ t('personal.profile.mypoas.cms') }}</ZButton>
          </div>
        </li>
      </ul>
      <div v-if="groups.past.length" class="flex flex-col gap-2">
        <div>
          <ZButton size="sm" variant="ghost" :aria-expanded="showPast" data-mypoas-past-toggle @click="showPast = !showPast">
            {{ t(showPast ? 'personal.profile.mypoas.hidePast' : 'personal.profile.mypoas.showPast', { n: groups.past.length }) }}
          </ZButton>
        </div>
        <ul v-if="showPast" class="m-0 flex list-none flex-col divide-y divide-line p-0" data-mypoas-past>
          <li v-for="r in groups.past" :key="r.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0" :data-mypoa="r.id">
            <div class="min-w-0 flex-1">
              <p class="m-0 text-sm font-semibold text-ink-2 [overflow-wrap:anywhere]">{{ r.clientName }}</p>
              <p class="m-0 text-[12.5px] text-ink-3"><span class="tabular-nums">№ {{ number(r) }}</span> · {{ sub(r) }}</p>
            </div>
            <ZTag :tone="docTag(r).tone" data-mypoa-status>{{ t(docTag(r).labelKey) }}</ZTag>
            <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" :loading="busy === `${r.id}:docx`" data-mypoa-download @click="download(r, true)">{{ t('personal.profile.mypoas.download') }}</ZButton>
          </li>
        </ul>
      </div>
    </template>
  </ProfileCard>
</template>
