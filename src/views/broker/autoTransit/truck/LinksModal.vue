<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { createLink, listLinks, revokeLink, type Party, type RecipientLink } from '@/api/autoTransit'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { ddmm, dateText, hhmm, linkUrl, partyLink, sortedParties } from './truckView'

// «Ссылки получателям»: строка на партию — получатель, состояние ссылки (нет / активна до / отозвана / истекла),
// когда открывали; «Создать ссылку», «Скопировать» (${origin}/t/${token}), «Отозвать», «Новая ссылка» (старая
// перестаёт работать — сервер отзывает её сам). Есть почта получателя — mailto с адресом и текстом (почты из
// платформы в очереди 1 нет).
const props = defineProps<{ open: boolean; truckId: string; plate: string; parties: Party[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const { confirm } = useConfirm()
const L = 'broker.autoTransit.links'

const links = ref<RecipientLink[]>([])
const loading = ref(false)
const error = ref(false)
const busyParty = ref<string | null>(null)
const load = async () => {
  loading.value = true
  error.value = false
  try {
    links.value = await listLinks(props.truckId)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
watch(() => props.open, (v) => { if (v) void load() }, { immediate: true })

const origin = () => window.location.origin
const ymd = (iso: string) => iso.slice(0, 10)
const rows = computed(() => {
  const now = new Date()
  return sortedParties(props).map((p) => {
    const { link, state } = partyLink(links.value, p.id, now)
    const url = link && state === 'active' ? linkUrl(origin(), link.token) : ''
    const email = p.recipientEmail.trim()
    const mailto = url && email
      ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(t(`${L}.mailSubject`, { plate: props.plate }))}&body=${encodeURIComponent(t(`${L}.mailBody`, { url }))}`
      : ''
    let stateText = t(`${L}.none`)
    if (state === 'active' && link) stateText = t(`${L}.active`, { date: dateText(ymd(link.expiresAtUtc)) })
    else if (state === 'revoked') stateText = t(`${L}.revoked`)
    else if (state === 'expired') stateText = t(`${L}.expired`)
    const opened = link?.lastOpenedAtUtc ? t(`${L}.opened`, { at: `${ddmm(link.lastOpenedAtUtc)} ${hhmm(link.lastOpenedAtUtc)}` }) : link ? t(`${L}.neverOpened`) : ''
    return { party: p, link, state, url, mailto, stateText, opened }
  })
})
const tone = (s: string) => (s === 'active' ? 'done' : s === 'none' ? 'neutral' : 'wait') as 'done' | 'neutral' | 'wait'

/** Скопировать: Clipboard API, без него (http, старый браузер) — через скрытое поле и execCommand. */
const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // ниже — запасной путь
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand?.('copy') ?? false
    ta.remove()
    return ok
  } catch {
    return false
  }
}
const copy = async (url: string) => {
  if (await copyText(url)) message.success(t(`${L}.copied`))
  else message.error(t(`${L}.copyFailed`))
}

const withParty = async (partyId: string, fn: () => Promise<unknown>) => {
  busyParty.value = partyId
  try {
    await fn()
    await load()
  } catch {
    // тост показал перехватчик
  } finally {
    busyParty.value = null
  }
}
const create = (p: Party) => withParty(p.id, async () => {
  const link = await createLink(props.truckId, p.id)
  void copy(linkUrl(origin(), link.token))
})
const renew = async (p: Party) => {
  const ok = await confirm({ title: t(`${L}.renewConfirm.title`), content: t(`${L}.renewConfirm.text`), okText: t(`${L}.renewConfirm.ok`) })
  if (ok) await create(p)
}
const revoke = async (p: Party, link: RecipientLink) => {
  const ok = await confirm({ title: t(`${L}.revokeConfirm.title`), content: t(`${L}.revokeConfirm.text`), okText: t(`${L}.revokeConfirm.ok`), danger: true })
  if (ok) await withParty(p.id, () => revokeLink(props.truckId, link.id))
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t(`${L}.title`)"
    :footer="false"
    :width="680"
    data-links-modal
    @update:open="emit('update:open', $event)"
  >
    <p class="m-0 mb-3 text-sm text-ink-3">{{ t(`${L}.hint`) }}</p>
    <ZSkeleton v-if="loading && !links.length" :lines="3" height="56px" />
    <ZAlert v-else-if="error" type="error" show-icon :message="t(`${L}.loadError`)">
      <template #action><ZButton size="sm" class="max-sm:h-11" data-links-retry @click="load()">{{ t('broker.autoTransit.truck.retry') }}</ZButton></template>
    </ZAlert>
    <ul v-else role="list" class="m-0 flex list-none flex-col p-0">
      <li v-for="r in rows" :key="r.party.id" class="flex min-w-0 flex-col gap-2 border-b border-line py-3 last:border-b-0" :data-link-row="r.party.id">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span class="min-w-0 text-sm font-semibold break-words text-ink">
            {{ t(`${L}.party`, { n: r.party.number, name: r.party.recipientName.trim() || t('broker.autoTransit.party.noRecipient') }) }}
          </span>
          <ZTag :tone="tone(r.state)" size="sm" :data-link-state="r.state">{{ r.stateText }}</ZTag>
          <span v-if="r.opened" class="text-xs text-muted">{{ r.opened }}</span>
        </div>
        <p v-if="r.url" class="m-0 min-w-0 truncate font-mono text-xs text-ink-2" data-link-url>{{ r.url }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="r.state === 'active' && r.link">
            <ZButton size="sm" variant="primary" class="max-sm:h-11 max-sm:px-4" data-link-copy @click="copy(r.url)">{{ t(`${L}.copy`) }}</ZButton>
            <a
              v-if="r.mailto"
              :href="r.mailto"
              class="inline-flex h-7 items-center rounded-field px-2.5 text-xs font-semibold text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:h-11"
              data-link-mail
            >{{ t(`${L}.mail`) }}</a>
            <ZButton size="sm" variant="ghost" class="max-sm:h-11" :loading="busyParty === r.party.id" :disabled="!!busyParty" data-link-renew @click="renew(r.party)">{{ t(`${L}.renew`) }}</ZButton>
            <ZButton size="sm" variant="danger-ghost" class="max-sm:h-11" :disabled="!!busyParty" data-link-revoke @click="revoke(r.party, r.link)">{{ t(`${L}.revoke`) }}</ZButton>
          </template>
          <ZButton v-else size="sm" variant="primary" class="max-sm:h-11 max-sm:px-4" :loading="busyParty === r.party.id" :disabled="!!busyParty" data-link-create @click="create(r.party)">{{ t(`${L}.create`) }}</ZButton>
        </div>
      </li>
    </ul>
  </ZModal>
</template>
