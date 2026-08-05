/**
 * Copy to clipboard with a fallback.
 *
 * navigator.clipboard needs a secure context. A site served over plain HTTP
 * from a local network address is exactly where someone would try this, so
 * the deprecated execCommand path stays.
 */

export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }

  const holder = document.createElement("textarea");
  holder.value = text;
  holder.setAttribute("readonly", "");
  holder.setAttribute("aria-hidden", "true");
  holder.style.position = "fixed";
  holder.style.top = "-1000px";
  holder.style.opacity = "0";
  document.body.append(holder);

  try {
    holder.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    holder.remove();
  }
}
