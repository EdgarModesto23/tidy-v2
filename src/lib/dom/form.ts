/** Submit a form by element id (for confirm-dialog → progressive enhancement flows). */
export function requestSubmitFormById(formId: string): void {
  const el = document.getElementById(formId);
  if (el instanceof HTMLFormElement) el.requestSubmit();
}
