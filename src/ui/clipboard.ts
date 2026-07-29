/**
 * Буфер обмена для кода штамма.
 *
 * Копирование доступно почти везде, чтение — нет: во врезке на itch и в части
 * браузеров `readText` либо отсутствует, либо требует разрешения. Поэтому
 * вставка идёт тремя путями, и ни один не обязателен:
 *
 *   1. буфер — если дают;
 *   2. настоящее событие `paste` (Ctrl+V, долгое нажатие) — работает везде;
 *   3. ссылка `?shtamm=КОД` — её удобно кинуть в чат.
 *
 * Если не вышло ничего, код всё равно виден на экране: восемь знаков без
 * похожих букв затем и выбраны, чтобы их можно было переписать руками.
 */

/** Копирование. false означает «не дали» — прибор попросит переписать код. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Чтение буфера. null означает «нечего взять» или «не дали прочитать». */
export async function readText(): Promise<string | null> {
  try {
    const text = await navigator.clipboard.readText()
    return text.trim() || null
  } catch {
    return null
  }
}

/**
 * Ловушка настоящей вставки. Нужна там, где читать буфер по кнопке нельзя,
 * — а вставить руками можно всегда.
 */
export function onPaste(handler: (text: string) => void): void {
  window.addEventListener('paste', (event) => {
    const text = (event as ClipboardEvent).clipboardData?.getData('text')?.trim()
    if (text) handler(text)
  })
}
