/** Client-submitted audit rows may describe previews only; live audit truth comes from the queue worker. */
export function assertClientRunRecordIsDryRun(isDryRun: boolean): void {
  if (!isDryRun) {
    throw new Error(
      "Client-submitted live run records are disabled. Live audit records are written only by the durable execution worker.",
    );
  }
}
