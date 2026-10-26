type UpdateHandler = (reloadPage?: boolean) => Promise<void>;
type UpdateState = { available: boolean; failed: boolean };
type UpdateListener = (state: UpdateState) => void;

let state: UpdateState = { available: false, failed: false };
let updateHandler: UpdateHandler | undefined;
const listeners = new Set<UpdateListener>();

function publish(next: UpdateState): void {
  state = next;
  listeners.forEach((listener) => listener(state));
}

export function configurePwaUpdateHandler(handler: UpdateHandler): void {
  updateHandler = handler;
}

export function notifyPwaUpdateAvailable(): void {
  publish({ available: true, failed: false });
}

export function notifyPwaUpdateFailure(error: unknown): void {
  console.error("Kxno Desk service worker registration failed.", error);
  publish({ available: false, failed: true });
}

export function subscribeToPwaUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function applyPwaUpdate(): Promise<void> {
  if (!updateHandler) throw new Error("The service worker update handler is not available.");
  await updateHandler(true);
}
