<script setup lang="ts">
import { ref } from 'vue'
import { PhMagnifyingGlass, PhPlus, PhTray, PhUploadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZPanel from '@/components/z/ZPanel.vue'
import ZPage from '@/components/z/ZPage.vue'
import { message } from '@/ui/message'

const search = ref('Казахмыс')
const bin = ref('210340012345')
const note = ref('Сертификат на позицию 3 запрошен у клиента 05.10')
const companies = ['ТОО «Казахмыс Трейд»', 'ТОО «Astana Foods»', 'ИП Сейткали А.', 'ТОО «Ақжол Логистик»', 'ТОО «Altyn Med»']
const tones = [
  ['neutral', 'Черновик'], ['info', 'Декларирование'], ['wait', 'На границе'], ['submitted', 'Подана'],
  ['done', 'Выпущена'], ['pay', 'Оплата'], ['danger', 'Проблема'], ['accent', 'Нужно от вас'],
] as const
</script>

<template>
  <div class="min-h-screen bg-canvas px-4 py-8 font-sans text-ink sm:px-10">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-8">
      <ZPage title="Каталог компонентов" subtitle="Волна 0a · стиль C · IBM Plex Sans">
        <template #meta><ZTag tone="info" size="sm">dev</ZTag></template>
        <template #actions>
          <ZButton variant="secondary" @click="message.info('Черновик сохранён')">Тост: инфо</ZButton>
          <ZButton variant="primary" @click="message.success('Декларация сохранена')">Тост: успех</ZButton>
          <ZButton variant="danger-ghost" @click="message.error({ content: 'Не удалось выгрузить XML: нет гр.30', duration: 6 })">Тост: ошибка</ZButton>
        </template>
      </ZPage>

      <ZPanel title="Кнопки">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <ZButton variant="primary"><template #icon><PhPlus :size="16" /></template>Новая заявка</ZButton>
            <ZButton>Открыть ДТ</ZButton>
            <ZButton variant="ghost">Отмена</ZButton>
            <ZButton variant="danger">Удалить заявку</ZButton>
            <ZButton variant="danger-ghost">Снять с подачи</ZButton>
            <ZButton variant="link">Показать историю</ZButton>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <ZButton variant="primary" loading>Подаём в КЕДЕН</ZButton>
            <ZButton disabled>Недоступно</ZButton>
            <ZButton size="sm"><template #icon><PhUploadSimple :size="14" /></template>Загрузить</ZButton>
            <ZButton size="sm" variant="ghost">Ещё</ZButton>
          </div>
        </div>
      </ZPanel>

      <div class="grid gap-6 md:grid-cols-2">
        <ZPanel title="Поля ввода">
          <div class="flex flex-col gap-3">
            <ZInput v-model:value="search" allow-clear placeholder="Поиск по клиенту, БИН, номеру">
              <template #prefix><PhMagnifyingGlass :size="16" /></template>
            </ZInput>
            <ZInput v-model:value="bin" mono :maxlength="12" placeholder="БИН" />
            <ZInput value="8471 30 000 0" mono invalid />
            <ZInput value="Только чтение" readonly />
            <ZInput value="Недоступно" disabled />
            <ZInput size="sm" placeholder="Маленькое поле" />
          </div>
        </ZPanel>
        <ZPanel title="Многострочное">
          <ZTextarea v-model:value="note" auto-grow placeholder="Комментарий для декларанта" />
        </ZPanel>
      </div>

      <ZPanel title="Статусы и аватары">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-2">
            <ZTag v-for="[tone, label] in tones" :key="tone" :tone="tone">{{ label }}</ZTag>
          </div>
          <div class="flex flex-col">
            <div v-for="c in companies" :key="c" class="flex items-center gap-3 border-b border-line py-2 last:border-0">
              <ZAvatar :name="c" />
              <span class="font-semibold">{{ c }}</span>
              <span class="ml-auto font-mono text-sm tabular-nums text-ink-3">8471 30 000 0</span>
            </div>
          </div>
          <p class="text-sm text-ink-3">Поиск по всему <ZKbd>⌘</ZKbd> <ZKbd>K</ZKbd></p>
        </div>
      </ZPanel>

      <div class="grid gap-6 md:grid-cols-2">
        <ZPanel title="Загрузка">
          <ZSkeleton :lines="4" />
        </ZPanel>
        <ZPanel padding="none">
          <ZEmpty title="Заявок пока нет" hint="Новые заявки клиентов появятся здесь, а вы получите уведомление">
            <template #icon><PhTray :size="20" /></template>
            <template #action><ZButton variant="primary" size="sm">Создать заявку</ZButton></template>
          </ZEmpty>
        </ZPanel>
      </div>
    </div>
  </div>
</template>
