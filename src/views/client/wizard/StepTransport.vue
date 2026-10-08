<script setup lang="ts">
import { computed, nextTick, ref, toRaw, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import { useConfirm } from '@/ui/confirm'
import type { ZOptionValue } from '@/ui/options'
import type { ShipmentDraft } from './useShipmentDraft'
import { blockTitle, phoneField, stepHint, stepTitle } from './wizardUi'

// Шаг 2 «Транспорт»: вид транспорта, поля по виду (как в прежнем мастере), контейнеры строками «номер + тип».
const props = defineProps<{ draft: ShipmentDraft }>()

const { t } = useI18n()
const { confirm } = useConfirm()
const uid = useId()
const headingId = `wz-transport-${uid}`
const containersId = `wz-containers-${uid}`

// Значения — коды IMPORT40_TRANSPORT_MODES (0 ЖД, 1 Авто, 2 Авиа, 3 Море); порядок — по частоте у клиентов.
const modes = computed(() => [
  { value: 1, label: t('enum.transportMode.road') },
  { value: 0, label: t('enum.transportMode.rail') },
  { value: 2, label: t('enum.transportMode.air') },
  { value: 3, label: t('enum.transportMode.sea') },
])
const mode = computed<ZOptionValue>({
  get: () => props.draft.transportMode,
  set: (v) => { props.draft.transportMode = Number(v) },
})

// ---- Контейнеры ----
const numberInputs = ref<(InstanceType<typeof ZInput> | null)[]>([])
const addContainer = async () => {
  props.draft.containers.push({ number: '', type: '' })
  await nextTick()
  numberInputs.value[props.draft.containers.length - 1]?.focus()
}
const removeContainer = async (i: number) => {
  const row = props.draft.containers[i]
  if (!row) return
  const number = row.number.trim()
  if (number) {
    const ok = await confirm({
      title: t('client.wizard.transport.removeTitle', { number }),
      okText: t('client.wizard.transport.removeOk'),
      cancelText: t('client.wizard.transport.keep'),
      danger: true,
    })
    if (!ok) return
  }
  // Индекс мог сместиться, пока открыт вопрос, — удаляем именно эту строку.
  const at = props.draft.containers.indexOf(row)
  if (at >= 0) props.draft.containers.splice(at, 1)
}
// Ключ строки не меняется, когда автосохранение присвоит ей id (иначе поле пересоздалось бы и потеряло фокус).
const keys = new WeakMap<object, number>()
let nextKey = 0
const rowKey = (c: object) => {
  const raw = toRaw(c)
  let k = keys.get(raw)
  if (k === undefined) {
    k = ++nextKey
    keys.set(raw, k)
  }
  return k
}

const iconButton =
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink-3 outline-hidden ' +
  'transition-colors duration-150 ease-out hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus motion-reduce:transition-none sm:size-9'
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-5" data-step="transport">
    <div>
      <h2 :id="headingId" tabindex="-1" :class="stepTitle">{{ t('client.wizard.transport.title') }}</h2>
      <p :class="stepHint">{{ t('client.wizard.transport.hint') }}</p>
    </div>

    <ZField :label="t('client.wizard.transport.mode')">
      <ZSegmented
        v-model:value="mode"
        :options="modes"
        class="self-start max-sm:flex max-sm:w-full max-sm:self-stretch max-sm:*:h-11 max-sm:*:flex-1 max-sm:*:justify-center max-sm:*:text-[15px]"
        data-wz-mode
      />
    </ZField>

    <div class="grid gap-4 sm:grid-cols-2 sm:gap-x-3" data-wz-mode-fields>
      <template v-if="draft.transportMode === 1">
        <ZField :label="t('client.wizard.transport.vehicle')">
          <ZInput v-model:value="draft.vehicleNumber" mono placeholder="123ABC01" autocomplete="off" :class="phoneField" data-wz-vehicle />
        </ZField>
        <ZField :label="t('client.wizard.transport.trailer')">
          <ZInput v-model:value="draft.trailerNumber" mono placeholder="456DEF01" autocomplete="off" :class="phoneField" data-wz-trailer />
        </ZField>
        <ZField :label="t('client.wizard.transport.driverPhone')">
          <ZPhone v-model:value="draft.driverPhone" :class="phoneField" data-wz-driver-phone />
        </ZField>
      </template>
      <template v-else-if="draft.transportMode === 0">
        <ZField :label="t('client.wizard.transport.wagon')">
          <ZInput v-model:value="draft.wagonNumber" mono inputmode="numeric" autocomplete="off" :class="phoneField" data-wz-wagon />
        </ZField>
        <ZField :label="t('client.wizard.transport.station')">
          <ZInput v-model:value="draft.station" :class="phoneField" data-wz-station />
        </ZField>
      </template>
      <template v-else-if="draft.transportMode === 2">
        <ZField :label="t('client.wizard.transport.flight')">
          <ZInput v-model:value="draft.flightNumber" mono placeholder="KC 924" autocomplete="off" :class="phoneField" data-wz-flight />
        </ZField>
        <ZField :label="t('client.wizard.transport.awb')">
          <ZInput v-model:value="draft.airWaybill" mono placeholder="465-12345678" autocomplete="off" :class="phoneField" data-wz-awb />
        </ZField>
      </template>
      <template v-else>
        <ZField :label="t('client.wizard.transport.vessel')">
          <ZInput v-model:value="draft.vesselName" :placeholder="t('client.wizard.transport.vesselPh')" :class="phoneField" data-wz-vessel />
        </ZField>
        <ZField :label="t('client.wizard.transport.bl')">
          <ZInput v-model:value="draft.billOfLading" mono placeholder="B/L" autocomplete="off" :class="phoneField" data-wz-bl />
        </ZField>
      </template>
    </div>

    <div role="group" :aria-labelledby="containersId" class="flex flex-col gap-3" data-wz-containers>
      <p class="m-0 flex flex-wrap items-baseline gap-x-2">
        <span :id="containersId" :class="blockTitle">{{ t('client.wizard.transport.containers') }}</span>
        <span class="text-[13px] text-muted">{{ t('client.wizard.transport.containersHint') }}</span>
      </p>

      <ul v-if="draft.containers.length" role="list" class="m-0 flex list-none flex-col gap-2.5 p-0">
        <li
          v-for="(c, i) in draft.containers"
          :key="rowKey(c)"
          class="grid grid-cols-[minmax(0,1fr)_92px_auto] items-center gap-2 sm:grid-cols-[minmax(0,240px)_120px_auto]"
          data-wz-container
        >
          <ZInput
            :ref="(el) => { numberInputs[i] = el as InstanceType<typeof ZInput> | null }"
            v-model:value="c.number"
            mono
            :maxlength="20"
            autocomplete="off"
            autocapitalize="characters"
            :placeholder="t('client.wizard.transport.containerNumber')"
            :aria-label="t('client.wizard.transport.containerNumber')"
            :class="phoneField"
            data-wz-container-number
          />
          <ZInput
            v-model:value="c.type"
            mono
            :maxlength="10"
            autocomplete="off"
            placeholder="40HC"
            :aria-label="t('client.wizard.transport.containerType')"
            :class="phoneField"
            data-wz-container-type
          />
          <button
            type="button"
            :aria-label="c.number.trim() ? t('client.wizard.transport.remove', { number: c.number.trim() }) : t('client.wizard.transport.removeRow')"
            :class="iconButton"
            data-wz-container-remove
            @click="removeContainer(i)"
          >
            <PhTrash :size="17" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <button
        type="button"
        class="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-field border-0 bg-transparent px-2 font-sans text-sm font-semibold text-zircon-ink outline-hidden -ml-2 hover:text-ink focus-visible:shadow-focus sm:min-h-9"
        data-wz-container-add
        @click="addContainer"
      >
        <PhPlus :size="15" weight="bold" aria-hidden="true" />{{ t('client.wizard.transport.add') }}
      </button>
    </div>
  </section>
</template>
