<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhQrCode, PhWarningCircle } from '@phosphor-icons/vue'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import LangSegment from '@/components/auth/LangSegment.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { ZTone } from '@/components/z/ZTag.vue'
import { documentVerifyApi, type VerifyDocument, type VerifySignature } from '@/api/documentVerify'
import { validDate } from '@/views/client/company/company'

// Проверка подписей по QR-коду из документа (20.10.2026): открывается без входа. Показывает, что за документ, его
// статус и кто подписал — те же сведения, что напечатаны в отметке «Документ подписан ЭЦП». Сторона из QR (?s=client)
// подсвечена.
const { t } = useI18n()
const route = useRoute()
const tx = (key: string, p?: Record<string, unknown>) => t(`verifyDoc.${key}`, p ?? {})

const state = ref<'loading' | 'ok' | 'notFound'>('loading')
const doc = ref<VerifyDocument | null>(null)
const focusSide = computed(() => String(route.query.s ?? ''))

onMounted(async () => {
  try {
    doc.value = await documentVerifyApi.get(String(route.params.token ?? ''))
    state.value = 'ok'
  } catch {
    state.value = 'notFound'
  }
})

const STATUS_TONE: Record<VerifyDocument['status'], ZTone> = { active: 'done', awaiting: 'wait', expired: 'neutral', revoked: 'danger', consumed: 'neutral' }
// Время — Астаны (как в отметке документа).
const astana = (iso: string | null, withTime = true) => {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
  return withTime ? `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : date
}
const sideLabel = (s: VerifySignature) => tx(`side.${s.side}`)
const methodLabel = (m: string) => tx(`method.${['egov', 'ncalayer', 'upload'].includes(m) ? m : 'other'}`)
const rows = (s: VerifySignature) => [
  [tx('signer'), s.signerName],
  [tx('iin'), s.signerIin],
  [tx('bin'), s.signerBin],
  [tx('org'), s.organization],
  [tx('cert'), s.certSerial],
  [tx('certValid'), s.certValidFromUtc && s.certValidToUtc ? `${astana(s.certValidFromUtc, false)} — ${astana(s.certValidToUtc, false)}` : null],
  [tx('signedAt'), s.signedAtUtc ? tx('astana', { at: astana(s.signedAtUtc) }) : null],
  [tx('methodLabel'), methodLabel(s.method)],
].filter(([, v]) => v) as [string, string][]
</script>

<template>
  <div class="min-h-dvh bg-canvas px-4 py-6 sm:py-10" data-verify-page>
    <div class="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <header class="flex items-center justify-between gap-3">
        <ZirconLogo size="md" />
        <LangSegment />
      </header>

      <div v-if="state === 'loading'" class="flex flex-col gap-3 rounded-panel border border-line bg-surface p-6">
        <span class="sr-only" role="status">{{ t('common.loading') }}</span>
        <ZSkeleton width="60%" height="22px" />
        <ZSkeleton height="80px" />
        <ZSkeleton height="80px" />
      </div>

      <section v-else-if="state === 'notFound'" class="flex flex-col items-start gap-2 rounded-panel border border-line bg-surface p-6" data-verify-not-found>
        <PhWarningCircle :size="28" class="text-tone-danger-fg" aria-hidden="true" />
        <h1 class="m-0 text-lg font-semibold text-ink">{{ tx('notFoundTitle') }}</h1>
        <p class="m-0 text-sm text-ink-2">{{ tx('notFoundText') }}</p>
      </section>

      <template v-else-if="doc">
        <section class="flex flex-col gap-3 rounded-panel border border-line bg-surface p-6 max-sm:p-4" data-verify-doc>
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <p class="m-0 inline-flex items-center gap-1.5 text-[13px] text-ink-3"><PhQrCode :size="16" aria-hidden="true" />{{ tx('lead') }}</p>
              <h1 class="m-0 mt-1 text-xl leading-7 font-semibold text-ink">{{ tx(`kind.${doc.kind}`, { no: doc.number }) }}</h1>
              <p class="m-0 mt-1 text-sm text-ink-3">{{ tx('generated', { date: astana(doc.generatedAtUtc, false) }) }}</p>
            </div>
            <ZTag :tone="STATUS_TONE[doc.status]" data-verify-status>{{ tx(`status.${doc.status}`) }}</ZTag>
          </div>
          <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt class="text-ink-3">{{ tx('client') }}</dt>
            <dd class="m-0 text-ink">{{ doc.clientName }}<span v-if="doc.clientBin" class="text-ink-3"> · {{ tx('bin') }} {{ doc.clientBin }}</span></dd>
            <template v-if="doc.kind === 'contract'">
              <dt class="text-ink-3">{{ tx('provider') }}</dt>
              <dd class="m-0 text-ink">{{ doc.providerName }}<span v-if="doc.providerBin" class="text-ink-3"> · {{ tx('bin') }} {{ doc.providerBin }}</span></dd>
            </template>
            <template v-if="doc.validUntilUtc">
              <dt class="text-ink-3">{{ tx('validUntil') }}</dt>
              <dd class="m-0 text-ink tabular-nums">{{ validDate(doc.validUntilUtc) }}</dd>
            </template>
          </dl>
          <p v-if="doc.status === 'revoked'" class="m-0 rounded-row bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">{{ tx('revokedText', { date: astana(doc.revokedAtUtc, false) }) }}</p>
        </section>

        <p v-if="!doc.signatures.length" class="m-0 rounded-row border border-line bg-surface px-4 py-3 text-sm text-ink-2">{{ tx('noSignatures') }}</p>
        <section
          v-for="s in doc.signatures"
          :key="s.side"
          :class="['flex flex-col gap-2.5 rounded-panel border bg-surface p-5 max-sm:p-4', focusSide === s.side ? 'border-zircon-ink' : 'border-line']"
          :data-verify-signature="s.side"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="m-0 flex-1 text-base font-semibold text-ink">{{ sideLabel(s) }}</h2>
            <span class="inline-flex items-center gap-1.5 text-[13px] text-tone-done-fg">
              <PhCheckCircle :size="16" weight="fill" aria-hidden="true" />{{ s.verified ? tx('verified') : tx('signedOk') }}
            </span>
          </div>
          <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm max-sm:grid-cols-1">
            <template v-for="[label, value] in rows(s)" :key="label">
              <dt class="text-ink-3">{{ label }}</dt>
              <dd class="m-0 break-words text-ink max-sm:mb-1.5">{{ value }}</dd>
            </template>
          </dl>
          <p v-if="!s.signerName" class="m-0 text-xs text-muted">{{ tx('legacy') }}</p>
        </section>

        <p class="m-0 text-xs text-muted">{{ tx('footer') }}</p>
      </template>
    </div>
  </div>
</template>
