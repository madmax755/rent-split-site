export async function copyText(txt: string, toast: (m: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(txt);
    toast("Copied.");
    return;
  } catch {
    /* fallback */
  }
  const ta = document.createElement("textarea");
  ta.value = txt;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    toast("Copied.");
  } catch {
    toast("Couldn't copy — select the text manually.");
  }
  document.body.removeChild(ta);
}
