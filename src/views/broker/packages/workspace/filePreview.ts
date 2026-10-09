// Просмотр файла пакета: вид (PDF, картинка, прочее) и загрузка файла в ссылку на объект.
// Общий для шторки просмотра на разборе и панели документа в редакторе партии.
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { documentPackagesApi } from '@/api/documentPackages'
import type { DocumentPackageFileDto } from '@/types/api'
import { saveBlob } from '@/ui/download'

export type FileKind = 'pdf' | 'image' | 'other'

export const fileKind = (f: DocumentPackageFileDto): FileKind => {
  const name = f.originalFileName.toLowerCase()
  const type = (f.contentType ?? '').toLowerCase()
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf'
  if (/\.(png|jpe?g|gif|webp)$/.test(name) || type.startsWith('image/')) return 'image'
  return 'other'
}

export interface FileBlob {
  /** Ссылка на объект для фрейма или картинки; у «прочего» — null (только «Скачать»). */
  url: Ref<string | null>
  loading: Ref<boolean>
  failed: Ref<boolean>
  load: () => Promise<void>
  download: () => Promise<void>
}

/**
 * Файл берётся, пока active() и файл выбран (blob → ссылка на объект); ссылка освобождается при смене файла,
 * active() = false и размонтировании. Ошибку загрузки показывает перехватчик, здесь — failed (для «Повторить»).
 */
export function useFileBlob(pkgId: () => string, file: () => DocumentPackageFileDto | null, active: () => boolean = () => true): FileBlob {
  const blob = ref<Blob | null>(null)
  const url = ref<string | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  const release = () => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = null
    blob.value = null
  }

  let seq = 0
  const load = async () => {
    const f = file()
    if (!f) return
    const my = ++seq
    release()
    loading.value = true
    failed.value = false
    try {
      const b = await documentPackagesApi.downloadFile(pkgId(), f.id)
      if (my !== seq) return
      blob.value = b
      // Не PDF и не картинка — во фрейм не кладём: только «Скачать».
      if (fileKind(f) !== 'other') url.value = URL.createObjectURL(b)
    } catch {
      if (my === seq) failed.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }
  watch(() => [active(), file()?.id] as const, ([on, id]) => {
    if (on && id) void load()
    else {
      seq++
      release()
      loading.value = false
      failed.value = false
    }
  }, { immediate: true })
  onBeforeUnmount(() => {
    seq++
    release()
  })

  const download = async () => {
    const f = file()
    if (!f) return
    if (blob.value) {
      saveBlob(blob.value, f.originalFileName)
      return
    }
    try {
      saveBlob(await documentPackagesApi.downloadFile(pkgId(), f.id), f.originalFileName)
    } catch {
      // тост показал перехватчик
    }
  }

  return { url, loading, failed, load, download }
}
