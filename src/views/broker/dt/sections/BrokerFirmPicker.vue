<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { getBrokerFirmByBin, listBrokerFirms, upsertBrokerFirm, type BrokerFirmDto } from '@/api/brokerFirms'
import { message } from '@/ui/message'

// Справочник фирм-брокеров (организации): выбор фирмы, поиск по БИН, сохранение. Это справочник, а не часть ДТ: в
// декларацию из него уходит только номер договора (гр. 54) — БИН, наименование, адрес и даты остаются здесь, для
// поиска и сохранения записи. Поэтому блок так и подписан, а номер договора — отдельное поле ДТ над ним.
// Номер договора меняется только действием пользователя: выбором фирмы (если номер в ДТ пуст), кнопкой «Подставить»
// у единственной фирмы или поиском по БИН. Открытие ДТ её не трогает: список приходит позже загрузки ДТ, и подстановка
// «сама» меняла бы декларацию и запускала автосохранение. Фирму по номеру договора, уже стоящему в ДТ, блок лишь
// показывает (без записи в ДТ).
const props = defineProps<{ contractNumber: string | null | undefined }>()
const emit = defineEmits<{ 'update:contractNumber': [value: string] }>()
const { t } = useI18n()
const tb = (key: string, p?: Record<string, unknown>) => t(`broker.dt.closing.firm.${key}`, p ?? {})

const firm = reactive({
  bin: '',
  name: '',
  address: '' as string | null,
  contractDate: null as string | null,
  contractValidUntil: null as string | null,
})
const firms = ref<BrokerFirmDto[]>([])
const listLoading = ref(false)
const listFailed = ref(false)
const finding = ref(false)
const saving = ref(false)
let alive = true
onBeforeUnmount(() => { alive = false })

const options = computed(() => firms.value.map((f) => ({ value: f.bin, label: `${f.name} · ${f.bin}` })))
const only = computed(() => (firms.value.length === 1 && !firm.bin ? firms.value[0] : null))

const showFirm = (f: BrokerFirmDto) => {
  firm.bin = f.bin
  firm.name = f.name
  firm.address = f.address
  firm.contractDate = f.contractDate
  firm.contractValidUntil = f.contractValidUntil
}
const setContract = (n: string | null | undefined) => {
  const v = (n ?? '').trim()
  if (v) emit('update:contractNumber', v.toUpperCase())
}

const load = async () => {
  listLoading.value = true
  listFailed.value = false
  try {
    const list = await listBrokerFirms()
    if (!alive) return
    firms.value = list
    // Показать фирму по номеру договора, уже стоящему в ДТ (ДТ не меняем).
    const contract = (props.contractNumber ?? '').trim()
    if (contract && !firm.bin) {
      const match = list.find((f) => (f.contractNumber ?? '').trim() === contract)
      if (match) showFirm(match)
    }
  } catch {
    if (alive) listFailed.value = true // справочник не загрузился — остаётся ввод БИН и «Найти»
  } finally {
    if (alive) listLoading.value = false
  }
}
onMounted(load)

const onPick = (bin: unknown) => {
  if (!bin) { firm.bin = ''; return }
  const f = firms.value.find((x) => x.bin === bin)
  if (!f) return
  showFirm(f)
  if (!(props.contractNumber ?? '').trim()) setContract(f.contractNumber) // номер, который ввёл декларант, не затираем
}

const find = async () => {
  const bin = firm.bin.trim()
  if (!bin) { message.warning(tb('binRequired')); return }
  finding.value = true
  try {
    const f = await getBrokerFirmByBin(bin)
    if (!f) { message.info(tb('notFound')); return }
    showFirm(f)
    setContract(f.contractNumber)
    // Нет номера у фирмы — в ДТ ничего не записано, о подстановке не говорим.
    message.success(tb((f.contractNumber ?? '').trim() ? 'found' : 'foundNoContract'))
  } catch {
    message.error(tb('findFailed'))
  } finally {
    finding.value = false
  }
}

const save = async () => {
  const name = firm.name.trim()
  const bin = firm.bin.trim()
  if (!name || !bin) { message.warning(tb('saveRequired')); return }
  saving.value = true
  try {
    await upsertBrokerFirm({
      name,
      bin,
      address: firm.address || null,
      contractNumber: props.contractNumber || null,
      contractDate: firm.contractDate || null,
      contractValidUntil: firm.contractValidUntil || null,
    })
    firms.value = await listBrokerFirms()
    message.success(tb('saved'))
  } catch {
    message.error(tb('saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="@container flex flex-col gap-4 rounded-panel border border-line bg-canvas p-4" data-broker-firm>
    <div class="flex flex-col gap-1">
      <h3 class="m-0 text-sm font-semibold text-ink">{{ tb('title') }}</h3>
      <p class="m-0 text-xs leading-5 text-ink-3" data-broker-firm-note>{{ tb('note') }}</p>
    </div>

    <div class="grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-1">
        <ZField :label="tb('pick')">
          <ZSelect
            :value="firm.bin || null"
            :options="options"
            :loading="listLoading"
            show-search
            allow-clear
            :placeholder="tb('pickPlaceholder')"
            popup-width="420px"
            class="max-sm:*:h-11"
            data-firm-pick
            @update:value="onPick"
          />
        </ZField>
        <!-- Не слот extra у ZField: он узнаёт о слоте один раз, а единственная фирма появляется после загрузки списка. -->
        <button
          v-if="only"
          type="button"
          class="inline-flex min-h-6 max-w-full cursor-pointer items-center self-start rounded-field border-0 bg-transparent p-0 text-left font-sans text-xs font-semibold text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
          data-firm-only
          @click="onPick(only.bin)"
        >{{ tb('useOnly', { name: only.name }) }}</button>
      </div>
      <ZField :label="tb('bin')">
        <div class="flex gap-2">
          <ZInput v-model:value="firm.bin" mono :placeholder="tb('binPlaceholder')" class="min-w-0 flex-1 max-sm:h-11" data-firm-bin />
          <ZButton :loading="finding" class="max-sm:h-11" data-firm-find @click="find">{{ tb('find') }}</ZButton>
        </div>
      </ZField>
      <ZField :label="tb('name')">
        <ZInput v-model:value="firm.name" class="max-sm:h-11" data-firm-name />
      </ZField>
      <ZField :label="tb('address')">
        <ZInput :value="firm.address" class="max-sm:h-11" data-firm-address @update:value="firm.address = $event" />
      </ZField>
      <ZField :label="tb('contractDate')">
        <ZDate v-model:value="firm.contractDate" allow-clear class="max-sm:h-11" data-firm-date />
      </ZField>
      <ZField :label="tb('validUntil')">
        <ZDate v-model:value="firm.contractValidUntil" allow-clear class="max-sm:h-11" data-firm-until />
      </ZField>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <ZButton :loading="saving" class="max-sm:h-11" data-firm-save @click="save">{{ tb('save') }}</ZButton>
      <span v-if="listFailed" class="text-xs text-ink-3" data-firm-list-failed>{{ tb('listFailed') }}</span>
    </div>
  </div>
</template>
