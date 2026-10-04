/** 单词发音：优先有道词典音频，失败时回退到浏览器语音合成 */
export function speak(word: string, accent: "uk" | "us" = "uk"): void {
  if (typeof window === "undefined" || !word) return;
  const type = accent === "uk" ? 1 : 2;
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
  const audio = new Audio(url);
  audio.play().catch(() => {
    if (typeof window.speechSynthesis === "undefined") return;
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = accent === "uk" ? "en-GB" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

export function phoneticText(uk: string, us: string): { uk: string; us: string } {
  return { uk: uk ? `/${uk}/` : "", us: us ? `/${us}/` : "" };
}
