<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { createLink, createTruckLink, listLinks, revokeLink, type LinkPurpose, type Party, type RecipientLink } from '@/api/autoTransit'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import LinkItemRow, { type LinkItem } from './LinkItemRow.vue'
import { ddmm, dateText, hhmm, linkUrl, partyLink, sortedParties, truckLink, type LinkState } from './truckView'

// «Ссылки» машины: по каждой партии — ссылка получателю на просмотр (/t/, declare или manage) и ссылка клиенту на
// загрузку документов груза (/u/, uploadCargo, declare); отдельно — ссылка водителю / перевозчику на документы машины
// (/u/, uploadVehicle, border). У каждой: состояние (нет / активна до / отозвана / истекла), когда открывали,
// «Создать», «Скопировать», «Отправить на почту» (если есть почта получателя), «Новая ссылка» (старая того же
// назначения перестаёт работать — сервер отзывает её сам), «Отозвать».
const props = withDefaults(defineProps<{
  open: boolean
  truckId: string
  plate: string
  parties: Party[]
  /** Ссылки просмотра получателю (declare или manage). */
  canView?: boolean
  /** Загрузка документов груза (declare). */
  canCargo?: boolean
  /** Загрузка документов машины (border). */
  canVehicle?: boolean
}>(), { canView: true, canCargo: false, canVehicle: false })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const { confirm } = useConfirm()
const L = 'broker.autoTransit.links'

const links = ref<RecipientLink[]>([])
const loading = ref(false)
const error = ref(false)
/** Какая строка сейчас выдаёт / отзывает ссылку: `${partyId|truck}:${purpose}`. */
const busyKey = ref<string | null>(null)
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

const item = (purpose: LinkPurpose, p: Party | null, found: { link: RecipientLink | null; state: LinkState }): LinkItem => {
  const { link, state } = found
  const url = link && state === 'active' ? linkUrl(origin(), link.token, purpose) : ''
  const email = p?.recipientEmail.trim() ?? ''
  const body = purpose === 'uploadCargo' ? 'mailBodyCargo' : 'mailBody'
  const mailto = url && email && purpose !== 'uploadVehicle'
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(t(`${L}.mailSubject`, { plate: props.plate }))}&body=${encodeURIComponent(t(`${L}.${body}`, { url }))}`
    : ''
  let stateText = t(`${L}.none`)
  if (state === 'active' && link) stateText = t(`${L}.active`, { date: dateText(ymd(link.expiresAtUtc)) })
  else if (state === 'revoked') stateText = t(`${L}.revoked`)
  else if (state === 'expired') stateText = t(`${L}.expired`)
  const opened = link?.lastOpenedAtUtc ? t(`${L}.opened`, { at: `${ddmm(link.lastOpenedAtUtc)} ${hhmm(link.lastOpenedAtUtc)}` }) : link ? t(`${L}.neverOpened`) : ''
  return { key: `${p?.id ?? 'truck'}:${purpose}`, purpose, party: p, link, state, url, mailto, label: t(`${L}.purpose.${purpose}`), stateText, opened }
}
const rows = computed(() => {
  const now = new Date()
  if (!props.canView && !props.canCargo) return []
  return sortedParties(props).map((p) => ({
    party: p,
    items: [
      ...(props.canView ? [item('view', p, partyLink(links.value, p.id, now))] : []),
      ...(props.canCargo ? [item('uploadCargo', p, partyLink(links.value, p.id, now, 'uploadCargo'))] : []),
    ],
  }))
})
const vehicle = computed(() => (props.canVehicle ? item('uploadVehicle', null, truckLink(links.value, new Date())) : null))

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

const withBusy = async (key: string, fn: () => Promise<unknown>) => {
  busyKey.value = key
  try {
    await fn()
    await load()
  } catch {
    // тост показал перехватчик
  } finally {
    busyKey.value = null
  }
}
const create = (it: LinkItem) => withBusy(it.key, async () => {
  const link = it.purpose === 'uploadVehicle'
    ? await createTruckLink(props.truckId)
    : await createLink(props.truckId, it.party!.id, it.purpose === 'uploadCargo' ? 'uploadCargo' : undefined)
  void copy(linkUrl(origin(), link.token, it.purpose))
})
const renew = async (it: LinkItem) => {
  const text = it.purpose === 'view' ? `${L}.renewConfirm.text` : `${L}.renewConfirm.textUpload`
  const ok = await confirm({ title: t(`${L}.renewConfirm.title`), content: t(text), okText: t(`${L}.renewConfirm.ok`) })
  if (ok) await create(it)
}
const revoke = async (it: LinkItem) => {
  const link = it.link
  if (!link) return
  const text = it.purpose === 'view' ? `${L}.revokeConfirm.text` : `${L}.revokeConfirm.textUpload`
  const ok = await confirm({ title: t(`${L}.revokeConfirm.title`), content: t(text), okText: t(`${L}.revokeConfirm.ok`), danger: true })
  if (ok) await withBusy(it.key, () => revokeLink(props.truckId, link.id))
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
    <div v-else class="flex min-w-0 flex-col">
      <ul v-if="rows.length" role="list" class="m-0 flex list-none flex-col p-0">
        <li v-for="r in rows" :key="r.party.id" class="flex min-w-0 flex-col gap-2 border-b border-line py-3 last:border-b-0" :data-link-row="r.party.id">
          <span class="min-w-0 text-sm font-semibold break-words text-ink">
            {{ t(`${L}.party`, { n: r.party.number, name: r.party.recipientName.trim() || t('broker.autoTransit.party.noRecipient') }) }}
          </span>
          <LinkItemRow
            v-for="it in r.items"
            :key="it.key"
            :item="it"
            :busy-key="busyKey"
            @copy="copy(it.url)"
            @renew="renew(it)"
            @revoke="revoke(it)"
            @create="create(it)"
          />
        </li>
      </ul>
      <section v-for="v in vehicle ? [vehicle] : []" :key="v.key" class="flex min-w-0 flex-col gap-2 py-3" :class="rows.length ? 'border-t border-line' : ''" data-link-vehicle>
        <span class="text-sm font-semibold text-ink">{{ t(`${L}.vehicleTitle`, { plate }) }}</span>
        <LinkItemRow :item="v" :busy-key="busyKey" @copy="copy(v.url)" @renew="renew(v)" @revoke="revoke(v)" @create="create(v)" />
      </section>
    </div>
  </ZModal>
</template>
