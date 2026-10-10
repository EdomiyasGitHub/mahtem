/**
 * Save bytes as a file through a local blob: URL. Nothing is uploaded;
 * the CSP forbids network connections anyway.
 */
export function downloadFile(name: string, content: Uint8Array | string, type = 'application/octet-stream'): void {
  const part: BlobPart = typeof content === 'string' ? content : new Uint8Array(content);
  const url = URL.createObjectURL(new Blob([part], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
