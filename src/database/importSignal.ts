const IMPORT_COMPLETED_EVENT = 'daynote:import-completed';

export function emitImportCompletedSignal(): void {
  window.dispatchEvent(new CustomEvent(IMPORT_COMPLETED_EVENT));
}

export function subscribeToImportCompletedSignal(callback: () => void): () => void {
  const handler = () => callback();

  window.addEventListener(IMPORT_COMPLETED_EVENT, handler);

  return () => {
    window.removeEventListener(IMPORT_COMPLETED_EVENT, handler);
  };
}
