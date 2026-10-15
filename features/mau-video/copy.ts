/** Sao chép vào clipboard, có phương án dự phòng cho trình duyệt/HTTP không hỗ trợ Clipboard API. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy failed");
  } finally {
    ta.remove();
  }
}
