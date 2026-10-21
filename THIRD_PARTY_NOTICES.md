# Сторонние компоненты в сборке фронтенда (third-party notices)

Здесь перечислены сторонние компоненты, у лицензий которых есть условия об уведомлении сверх обычного
`package.json`. Полные тексты лицензий лежат в самих пакетах (`node_modules/<пакет>/LICENSE*`) и должны
сопровождать сборку при её передаче третьим лицам.

## heic2any 0.0.4

- Назначение: перевод фото HEIC/HEIF (iPhone) в JPEG в браузере перед загрузкой (`src/utils/heic.ts`,
  `src/utils/heicLoader.ts`). Подгружается лениво, отдельным чанком — только когда выбран HEIC-файл и браузер
  не открыл его сам.
- Лицензия: MIT. Автор: Alex Corvi. Исходники: https://github.com/alexcorvi/heic2any
- Текст лицензии: `node_modules/heic2any/LICENSE` (входит в пакет).

### Встроенный libheif (LGPL-3.0)

Внутри `heic2any` (файл `dist/heic2any.js`) собран декодер **libheif** (через libheif-js, emscripten),
лицензия — **GNU Lesser General Public License v3.0** (LGPL-3.0).

- Исходники libheif: https://github.com/strukturag/libheif
- Текст LGPL-3.0: https://www.gnu.org/licenses/lgpl-3.0.html (и GPL-3.0, на которую она ссылается:
  https://www.gnu.org/licenses/gpl-3.0.html).
- Как выполняются условия LGPL: библиотека не изменялась и попадает в сборку отдельным файлом-чанком
  (динамический `import('heic2any')`), не смешиваясь с кодом приложения, — её можно заменить своей сборкой
  libheif/heic2any с тем же интерфейсом без пересборки остального кода.

Если пакет обновляется или заменяется (например, на `heic-to`), обновите этот файл.
