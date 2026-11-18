// Whether the map should claim an Obsidian hotkey (Mod+E, Mod+Z, …) for this keypress.
export function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (el as HTMLElement).isContentEditable === true;
}
export function shouldClaimHotkey(active: Element | null, root: Element | null): boolean {
  return !!root && !!active && root.contains(active) && !isTextField(active);
}
