export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* HTTP/WebView fallback below. */ }
  }
  const active = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()) : [];
  const input = document.createElement('textarea');
  input.value = text; input.setAttribute('aria-hidden','true'); input.tabIndex=-1;
  Object.assign(input.style,{position:'fixed',left:'-10000px',top:'0',opacity:'0'});
  document.body.append(input); input.focus({preventScroll:true}); input.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard access was denied. Select text and use your keyboard copy shortcut.');
  } finally {
    input.remove(); active?.focus({preventScroll:true});
    if (selection) { selection.removeAllRanges(); for (const range of ranges) if (range.startContainer.isConnected) selection.addRange(range); }
  }
}
