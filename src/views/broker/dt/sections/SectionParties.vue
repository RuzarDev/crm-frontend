<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBookOpen, PhFloppyDisk, PhUserCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import type { CompanyLookupDto } from '@/api/companyLookup'
import type { ClientCompanyProfileDto } from '@/api/import40Contract'
import { partyRefsApi, type PartyRefDto } from '@/api/partyRefs'
import { useClassifiersStore } from '@/stores/classifiers'
import { message } from '@/ui/message'
import type { ZOption } from '@/ui/options'
import DtGraphHelp from '../DtGraphHelp.vue'
import { dedupeOptions } from '../dtOptions'
import {
  SAME_FLAG, changedOnly, copyDeclarant, lookupPatch, profilePatch, readParty, refBody, refPatch, syncWithDeclarant, writeParty,
  type PartyKey, type PartyPatch, type SameKey,
} from '../dtParties'
import type { DtFormState } from '../dtPayload'
import PartyFields from './PartyFields.vue'
import PartyRefsModal from './PartyRefsModal.vue'

// Раздел «Стороны»: декларант (гр. 14), получатель (гр. 8), лицо, ответственное за финансовое урегулирование
// (гр. 9), отправитель (гр. 2). У гр. 8 / 9 — «Совпадает с декларантом»: блок свёрнут в строку, поля повторяют
// гр. 14 (копия при включении и при каждой правке гр. 14); выключили — поля раскрываются с текущими значениями.
// Форму раздел пишет только по действию пользователя: открытие раздела ничего не меняет (иначе — лишний автосейв).
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  countryOptions: ZOption[]
  clientProfile?: ClientCompanyProfileDto | null
}>()
const { t } = useI18n()
const tp = (key: string, named?: Record<string, unknown>) => t(`broker.dt.parties.${key}`, named ?? {})
const classifiers = useClassifiersStore()
const categoryOptions = computed<ZOption[]>(() => dedupeOptions(classifiers.options('itn-categories')))

type Block = { key: PartyKey; graph: string; title: string; same?: SameKey; refs?: 'sender' | 'receiver' }
const blocks = computed<Block[]>(() => [
  { key: 'declarant', graph: '14', title: tp('declarant') },
  { key: 'receiver', graph: '8', title: tp('receiver'), same: 'receiver', refs: 'receiver' },
  { key: 'financialSubject', graph: '9', title: tp('financialSubject'), same: 'financialSubject' },
  { key: 'sender', graph: '2', title: tp('sender'), refs: 'sender' },
])
const values = computed(() => ({
  declarant: readParty(props.form, 'declarant'),
  receiver: readParty(props.form, 'receiver'),
  financialSubject: readParty(props.form, 'financialSubject'),
  sender: readParty(props.form, 'sender'),
}))
const isSame = (b: Block) => !!b.same && !!props.form[SAME_FLAG[b.same]]

/** Запись правки стороны; правка декларанта сразу уходит в гр. 8 / 9 с «Совпадает с декларантом». */
const apply = (key: PartyKey, patch: PartyPatch) => {
  const diff = changedOnly(values.value[key], patch)
  if (!Object.keys(diff).length) return
  writeParty(props.form, key, diff)
  if (key === 'declarant') syncWithDeclarant(props.form)
}
const onFound = (key: PartyKey, c: CompanyLookupDto) => apply(key, lookupPatch(values.value[key], c))
const setSame = (to: SameKey, on: boolean) => {
  if (on) copyDeclarant(props.form, to)
  props.form[SAME_FLAG[to]] = on
}

// ---- «Из профиля клиента» (гр. 8) ----
const fillFromClient = () => {
  const p = props.clientProfile
  if (!p) return
  apply('receiver', profilePatch(values.value.receiver, p))
  message.success(tp('fromClientDone'))
}

// ---- Справочник сторон (гр. 2 и 8) ----
const refsOpen = ref(false)
const refsTarget = ref<'sender' | 'receiver'>('receiver')
const openRefs = (target: 'sender' | 'receiver') => {
  refsTarget.value = target
  refsOpen.value = true
}
const onPick = (r: PartyRefDto) => {
  apply(refsTarget.value, refPatch(refsTarget.value, r))
  refsOpen.value = false
}
const onRegistryFound = (c: CompanyLookupDto) => {
  const target = refsTarget.value
  const patch = lookupPatch(values.value[target], c)
  if (target === 'receiver') patch.bin = c.bin
  apply(target, patch)
  refsOpen.value = false
}
const saving = ref<'sender' | 'receiver' | null>(null)
const saveRef = async (target: 'sender' | 'receiver') => {
  const body = refBody(target, values.value[target])
  if (!body.name.trim()) {
    message.warning(tp('refs.nameRequired'))
    return
  }
  saving.value = target
  try {
    await partyRefsApi.upsert(body)
    message.success(tp('refs.saved'))
  } catch {
    message.error(tp('refs.saveFailed'))
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <section class="flex flex-col" data-dt-parties>
    <div
      v-for="(b, i) in blocks"
      :key="b.key"
      :class="['flex flex-col gap-4', i > 0 && 'mt-5 border-t border-line pt-5']"
      :data-party="b.key"
    >
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div class="min-w-0 flex-1">
          <h2 class="m-0 flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-ink">
            {{ b.title }}
            <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: b.graph }) }}</span>
            <DtGraphHelp :graph="b.graph" />
          </h2>
          <p v-if="isSame(b)" class="m-0 mt-1 text-[13px] text-ink-3" data-party-same-summary>
            {{ tp('sameSummary') }}<template v-if="values.declarant.name"> · {{ values.declarant.name }}</template><template v-if="values.declarant.bin"> · <span class="font-mono">{{ values.declarant.bin }}</span></template>
          </p>
        </div>
        <div v-if="!readonly && b.refs && !isSame(b)" class="flex flex-wrap items-center gap-1">
          <ZButton v-if="b.key === 'receiver' && clientProfile" variant="ghost" size="sm" data-party-from-client @click="fillFromClient">
            <template #icon><PhUserCircle :size="16" aria-hidden="true" /></template>
            {{ tp('fromClient') }}
          </ZButton>
          <ZButton variant="ghost" size="sm" :data-party-refs-open="b.refs" @click="openRefs(b.refs)">
            <template #icon><PhBookOpen :size="16" aria-hidden="true" /></template>
            {{ tp('refs.open') }}
          </ZButton>
          <ZButton variant="ghost" size="sm" :loading="saving === b.refs" :data-party-refs-save="b.refs" @click="saveRef(b.refs)">
            <template #icon><PhFloppyDisk :size="16" aria-hidden="true" /></template>
            {{ tp('refs.save') }}
          </ZButton>
        </div>
        <span v-if="b.same" class="shrink-0" :data-graph="isSame(b) ? b.graph : undefined">
          <ZSwitch
            :checked="isSame(b)"
            :disabled="readonly"
            class="min-h-11 sm:min-h-9"
            :data-party-same="b.same"
            @update:checked="setSame(b.same, $event)"
          >
            {{ tp('sameAsDeclarant') }}
          </ZSwitch>
        </span>
      </div>

      <PartyFields
        v-if="!isSame(b)"
        :party-key="b.key"
        :values="values[b.key]"
        :readonly="readonly"
        :country-options="countryOptions"
        :category-options="categoryOptions"
        :graph="b.graph"
        @update="apply(b.key, $event)"
        @found="onFound(b.key, $event)"
      />
    </div>

    <PartyRefsModal
      v-model:open="refsOpen"
      :target="refsTarget"
      :initial-query="values[refsTarget].name ?? ''"
      @pick="onPick"
      @found="onRegistryFound"
    />
  </section>
</template>
