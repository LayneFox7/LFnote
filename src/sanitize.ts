const ALLOWED = new Set([
  'B',
  'I',
  'U',
  'S',
  'STRONG',
  'EM',
  'SPAN',
  'FONT',
  'BR',
  'DIV',
  'P',
  'UL',
  'OL',
  'LI',
  'INPUT',
])

function cleanNode(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (!ALLOWED.has(child.tagName)) {
      child.replaceWith(...Array.from(child.childNodes))
      continue
    }
    if (child.tagName === 'INPUT') {
      for (const attr of Array.from(child.attributes)) {
        if (attr.name === 'type' && attr.value === 'checkbox') continue
        if (attr.name === 'checked') continue
        child.removeAttribute(attr.name)
      }
      child.setAttribute('type', 'checkbox')
      continue
    }
    for (const attr of Array.from(child.attributes)) {
      if (attr.name.startsWith('on')) {
        child.removeAttribute(attr.name)
      } else if (attr.name === 'style') {
        const el = child as HTMLElement
        const color = el.style?.color
        if (color) el.setAttribute('style', `color: ${color}`)
        else el.removeAttribute('style')
      } else if (attr.name === 'class' && child.className !== 'cb-line') {
        child.removeAttribute('class')
      }
    }
    cleanNode(child)
  }
}

export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  cleanNode(doc.body)
  return doc.body.innerHTML.trim()
}

export function toggleCheckboxInHtml(html: string, index: number, checked: boolean): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const input = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))[index]
  if (!input) return html
  if (checked) input.setAttribute('checked', '')
  else input.removeAttribute('checked')
  return doc.body.innerHTML
}

export function countCheckboxes(html: string): { total: number; checked: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
  return { total: inputs.length, checked: inputs.filter((i) => i.hasAttribute('checked') || i.checked).length }
}

const BLOCK_TAGS = new Set(['DIV', 'P'])

export function splitHtmlLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.body
  const lines: string[] = []
  let buf: Node[] = []

  const flush = () => {
    if (buf.length === 0) return
    const wrap = doc.createElement('div')
    for (const n of buf) wrap.appendChild(n)
    const s = sanitize(wrap.innerHTML)
    if (s) lines.push(s)
    buf = []
  }

  const collect = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? '').split('\n')
        parts.forEach((part, i) => {
          if (i > 0) flush()
          if (part) buf.push(doc.createTextNode(part))
        })
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as Element
      if (el.tagName === 'BR') {
        flush()
      } else if (el.tagName === 'UL' || el.tagName === 'OL') {
        flush()
        buf.push(el.cloneNode(true))
        flush()
      } else if (BLOCK_TAGS.has(el.tagName)) {
        flush()
        collect(el)
        flush()
      } else {
        buf.push(el.cloneNode(true))
      }
    }
  }

  collect(root)
  flush()
  return lines
}

export function clipboardText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const input of Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) {
    input.insertAdjacentText('beforebegin', input.hasAttribute('checked') || input.checked ? '[x] ' : '[ ] ')
    input.remove()
  }
  const lines = (doc.body.textContent ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.map((l) => `- ${l}`).join('\n')
}
