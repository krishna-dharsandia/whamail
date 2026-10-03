/** WhatsApp rejects text messages longer than this. */
export const MAX_MESSAGE_LENGTH = 4096;

const HTML_TAG = /<\/?[a-z][^>]*>/i;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
};

/**
 * Templates are authored in the HTML email editor, but WhatsApp only renders
 * plain text with its own light markup. Convert an HTML body into that:
 * block elements become line breaks, bold/italic/strike map to * _ ~, and
 * links keep their URL. Plain-text bodies pass through untouched.
 */
export function toWhatsAppText(body: string): string {
  if (!HTML_TAG.test(body)) return tidy(decodeEntities(body));

  let text = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, "");

  // Source formatting whitespace is not content.
  text = text.replace(/\s*\n\s*/g, " ");

  text = text.replace(/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_m, d, s, inner) => {
    const href = decodeEntities(String(d ?? s ?? "")).trim();
    const label = stripTags(inner).trim();
    if (!/^https?:\/\//i.test(href)) return label;
    if (!label || label === href || href.replace(/\/$/, "") === label.replace(/\/$/, "")) return href;
    return `${label} (${href})`;
  });

  text = wrapInline(text, "b|strong", "*");
  text = wrapInline(text, "i|em", "_");
  text = wrapInline(text, "s|strike|del", "~");

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<\/(p|h[1-6]|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<\/(div|tr|table|section|article|header|footer)>/gi, "\n");

  return tidy(decodeEntities(stripTags(text)));
}

function wrapInline(text: string, tags: string, marker: string): string {
  const pattern = new RegExp(`<(${tags})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
  return text.replace(pattern, (_m, _tag, inner: string) => {
    const content = inner.trim();
    // WhatsApp markup cannot span lines or wrap nothing.
    if (!content || /<br|<\/(p|div|li|tr|h[1-6])>/i.test(content)) return inner;
    const lead = inner.match(/^\s*/)?.[0] ?? "";
    const trail = inner.match(/\s*$/)?.[0] ?? "";
    return `${lead}${marker}${content}${marker}${trail}`;
  });
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
