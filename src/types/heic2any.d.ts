// Минимальные типы heic2any 0.0.4 (MIT) — только то, что зовёт utils/heicLoader.ts. Пакет записан в package.json;
// в рабочей копии без `npm install` его может не быть, а vue-tsc не должен из-за этого падать (вместо @ts-ignore).
declare module 'heic2any' {
  interface Heic2AnyOptions {
    blob: Blob
    toType?: string
    quality?: number
    multiple?: boolean
    gifInterval?: number
  }
  export default function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>
}
