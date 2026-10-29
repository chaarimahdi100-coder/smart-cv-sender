/**
 * Text & HTML Sanitization Utility.
 *
 * Ensures that scraped, ATS-derived, or user-supplied job descriptions
 * are rendered cleanly as plain text without raw HTML tags or unescaped HTML entities.
 */

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&ndash;": "-",
  "&mdash;": "-",
  "&hellip;": "...",
  "&laquo;": "«",
  "&raquo;": "»",
  "&bull;": "•",
  "&middot;": "·",
};

/**
 * Decodes all HTML entities (named, numeric decimal, and numeric hex).
 * Normalizes non-breaking spaces (\u00A0) to standard ASCII spaces.
 * Handles multi-layered / double-escaped entities safely (e.g. &amp;lt; -> &lt; -> <).
 */
export function decodeHtmlEntities(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let prev = "";
  let current = raw;
  let iterations = 0;

  // Maximum 3 passes to handle nested encoding like &amp;lt; without infinite loop risk
  while (current !== prev && iterations < 3) {
    prev = current;
    iterations++;

    // 1. Replace known named entities
    for (const [entity, replacement] of Object.entries(NAMED_ENTITIES)) {
      if (current.includes(entity)) {
        current = current.replaceAll(entity, replacement);
      }
    }

    // 2. Replace case-insensitive common entities
    current = current
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'");

    // 3. Replace numeric decimal entities (e.g. &#160; or &#8217;)
    current = current.replace(/&#(\d+);/g, (_match, dec) => {
      try {
        const code = parseInt(dec, 10);
        if (code === 160) return " ";
        return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
      } catch {
        return "";
      }
    });

    // 4. Replace numeric hex entities (e.g. &#xA0; or &#x27;)
    current = current.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      try {
        const code = parseInt(hex, 16);
        if (code === 160) return " ";
        return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
      } catch {
        return "";
      }
    });
  }

  // Normalize non-breaking spaces to standard ASCII spaces
  return current.replace(/\u00A0/g, " ");
}

/**
 * Converts HTML content or HTML-escaped content into clean, readable plain text.
 * - Strips scripts, styles, iframes and their content.
 * - Converts block-level tags (<p>, <div>, <br>, <li>, <h1>-<h6>, <tr>) to spaces/newlines so words do not merge.
 * - Strips inline formatting tags (<strong>, <em>, <span>, <a>) without inserting unwanted spacing before punctuation.
 * - Recursively decodes HTML entities.
 * - Strips all remaining HTML tags.
 * - Normalizes excessive whitespace and control characters.
 */
export function cleanHtmlToPlainText(
  raw: string | null | undefined,
  options?: { maxLength?: number }
): string {
  if (!raw || typeof raw !== "string") return "";

  let text = raw;

  // 1. Remove dangerous or non-content tags including their inner content
  text = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");

  // 2. Decode entities first so entity-encoded tags (e.g. &lt;p&gt;) become real tags to be parsed
  text = decodeHtmlEntities(text);

  // 3. Convert line-breaking and block tags to spaces/newlines to avoid smashing words together
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|li|tr|section|article|blockquote)\b[^>]*>/gi, " ");

  // 4. Strip inline formatting tags cleanly without adding space
  text = text.replace(/<\/?(strong|b|em|i|u|span|a|small|sub|sup|font|code)\b[^>]*>/gi, "");

  // 5. Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // 6. Decode entities again in case inner text contained entity-encoded text (e.g. &amp;nbsp;)
  text = decodeHtmlEntities(text);

  // 7. Final safety check: strip any leftover angle brackets from tags
  text = text.replace(/<[^>]*>/g, " ");

  // 8. Fix spacing before punctuation caused by removed tags (e.g. "word ," -> "word,")
  text = text.replace(/[ \t]+([,.;:!?])/g, "$1");

  // 9. Normalize control characters and whitespace
  text = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ \n/g, "\n")
    .replace(/\n /g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 10. Truncate if maxLength specified
  if (options?.maxLength && text.length > options.maxLength) {
    text = text.substring(0, options.maxLength).trim() + "…";
  }

  return text;
}
