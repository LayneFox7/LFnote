import { useEffect, useRef } from 'react'
import { sanitize } from './sanitize'

export interface EditorApi {
  run: (cmd: string, value?: string) => void
}

export const CHECKBOX_HTML = '<div class="cb-line"><input type="checkbox"><span class="cb-text"> </span></div>'

export function useRichEditor(initialHtml: string, onRegister: (api: EditorApi | null) => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = initialHtml
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [initialHtml])

  useEffect(() => {
    onRegister({
      run: (cmd: string, value?: string) => {
        const el = ref.current
        if (!el) return
        el.focus()
        if (cmd === 'checkbox') document.execCommand('insertHTML', false, CHECKBOX_HTML)
        else document.execCommand(cmd, false, value)
      },
    })
    return () => onRegister(null)
  }, [onRegister])

  const getHtml = () => sanitize(ref.current?.innerHTML ?? '')
  const clear = () => {
    if (ref.current) ref.current.innerHTML = ''
  }

  return { ref, getHtml, clear }
}
