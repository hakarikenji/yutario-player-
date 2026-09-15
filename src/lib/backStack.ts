/**
 * Back-navigation stack — every modal/screen in the app registers itself
 * while open and pops in LIFO order when the user presses Android's
 * hardware back button (Capacitor `backButton`) or the web-equivalent
 * gestures (browser back, Escape).
 *
 * Contract: only when the stack is EMPTY does the shell fall through to
 * default platform behavior — on Android that is `App.minimizeApp()`
 * (never kill/reload), in the browser it's normal history navigation.
 */

export type BackHandler = () => void;

interface Entry {
  id: string;
  handler: BackHandler;
}

const stack: Entry[] = [];

/** Register (or refresh) a handler. Registration order defines pop order. */
export function pushBackHandler(id: string, handler: BackHandler): void {
  const i = stack.findIndex((e) => e.id === id);
  if (i >= 0) stack[i].handler = handler;
  else stack.push({ id, handler });
}

export function popBackHandler(id: string): void {
  const i = stack.findIndex((e) => e.id === id);
  if (i >= 0) stack.splice(i, 1);
}

/**
 * Fire the topmost handler (LIFO). Returns true when a handler consumed
 * the back event — the shell must then do nothing else.
 */
export function consumeBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  stack.pop();
  try {
    top.handler();
  } catch {
    /* a broken overlay must never crash the shell */
  }
  return true;
}

/** Current stack depth (diagnostics/tests). */
export function backDepth(): number {
  return stack.length;
}
