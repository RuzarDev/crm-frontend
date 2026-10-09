import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../sanitizeHtml'

describe('sanitizeHtml', () => {
  it('пусто — пустая строка', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml('')).toBe('')
  })

  it('убирает скрипты, стили, iframe и object вместе с содержимым', () => {
    const out = sanitizeHtml('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="https://x"></iframe><object data="x"></object><embed src="x">b')
    expect(out).toBe('<p>a</p>b')
  })

  it('убирает обработчики on* и style/class', () => {
    const out = sanitizeHtml('<p onclick="alert(1)" onmouseover="x()" style="color:red" class="c">t</p><img src="x" onerror="alert(1)">')
    expect(out).toBe('<p>t</p>')
  })

  it('ссылки: javascript:/data:/vbscript: удаляются, http(s)/mailto/относительные остаются и открываются в новой вкладке', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href=" JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="java&#x09;script:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="data:text/html,<script>1</script>">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="https://eec.eaeunion.org/a?b=1&amp;c=2">x</a>'))
      .toBe('<a href="https://eec.eaeunion.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">x</a>')
    expect(sanitizeHtml('<a href="mailto:a@b.kz">m</a>')).toBe('<a href="mailto:a@b.kz" target="_blank" rel="noopener noreferrer">m</a>')
    expect(sanitizeHtml('<a href="/doc/1">d</a>')).toBe('<a href="/doc/1" target="_blank" rel="noopener noreferrer">d</a>')
  })

  it('оставляет таблицы (с colspan/rowspan), списки, b/i/p/br', () => {
    const html = '<table><thead><tr><th colspan="2">Г</th></tr></thead><tbody><tr><td rowspan="2" width="10">1</td><td>2</td></tr></tbody></table>'
      + '<ul><li>один</li></ul><ol><li>два</li></ol><p><b>ж</b> <i>к</i><br>н</p><strong>s</strong><em>e</em>'
    expect(sanitizeHtml(html)).toBe(
      '<table><thead><tr><th colspan="2">Г</th></tr></thead><tbody><tr><td rowspan="2">1</td><td>2</td></tr></tbody></table>'
      + '<ul><li>один</li></ul><ol><li>два</li></ol><p><b>ж</b> <i>к</i><br>н</p><strong>s</strong><em>e</em>',
    )
  })

  it('незнакомые теги разворачивает, текст сохраняет; svg/math/form убирает', () => {
    expect(sanitizeHtml('<font color="red">текст <u>u</u></font>')).toBe('текст <u>u</u>')
    expect(sanitizeHtml('<svg><a href="javascript:1">x</a></svg><math>m</math><form><input value="1"></form>ok')).toBe('ok')
  })

  it('экранирует текст, комментарии убирает', () => {
    expect(sanitizeHtml('a &lt;script&gt; <!-- c --> b')).toBe('a &lt;script&gt;  b')
  })

  it('регистр и обфускация: SCRIPT, ONCLICK=, JaVaScRiPt:, сущности, управляющие символы, одиночный svg onload', () => {
    expect(sanitizeHtml('<SCRIPT>alert(1)</SCRIPT><P ONCLICK="alert(1)" OnMouseOver=x>t</P>')).toBe('<p>t</p>')
    expect(sanitizeHtml('<A HREF="JaVaScRiPt:alert(1)">x</A>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="\u0001javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="jav\nascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<svg onload="alert(1)">')).toBe('')
    expect(sanitizeHtml('<svg/onload=alert(1)>текст')).toBe('')
    expect(sanitizeHtml('<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>')).toBe('')
  })

  it('картинки: адрес http(s) или «//…» (формулы ЕЭК, схемы adilet), с alt, без referrer и on*; иначе убираются', () => {
    expect(sanitizeHtml('<img src="https://eec.eaeunion.org/f.png" alt="Формула" onerror="alert(1)" width="10" style="x">'))
      .toBe('<img src="https://eec.eaeunion.org/f.png" alt="Формула" loading="lazy" referrerpolicy="no-referrer">')
    expect(sanitizeHtml('<IMG SRC="HTTPS://eec.eaeunion.org/f.png">')).toBe('<img src="HTTPS://eec.eaeunion.org/f.png" loading="lazy" referrerpolicy="no-referrer">')
    expect(sanitizeHtml('<img src="http://adilet.zan.kz/files/1.png" onload="alert(1)">'))
      .toBe('<img src="http://adilet.zan.kz/files/1.png" loading="lazy" referrerpolicy="no-referrer">')
    expect(sanitizeHtml('<img src="//adilet.zan.kz/files/2.gif" alt="Схема">'))
      .toBe('<img src="//adilet.zan.kz/files/2.gif" alt="Схема" loading="lazy" referrerpolicy="no-referrer">')
    expect(sanitizeHtml('<img src="///etc/passwd">')).toBe('')
    expect(sanitizeHtml('<img src="ftp://host/f.png">')).toBe('')
    expect(sanitizeHtml('<img src=" java\tscript:alert(1)">')).toBe('')
    expect(sanitizeHtml('<img src="javascript:alert(1)">')).toBe('')
    expect(sanitizeHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">')).toBe('')
    expect(sanitizeHtml('<img src="/local.png">')).toBe('')
    expect(sanitizeHtml('<img>')).toBe('')
  })
})
