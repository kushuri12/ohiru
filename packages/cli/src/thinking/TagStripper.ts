/**
 * Satu tempat untuk semua tag stripping.
 * Dipanggil SEBELUM teks apapun dikirim ke Ink/chalk untuk di-render.
 */
export class TagStripper {

  // Semua pola tag yang harus disaring dari output
  private static readonly STRIP_PATTERNS: RegExp[] = [
    /<think>/gi,
    /<\/think>/gi,
    /<thinking>/gi,
    /<\/thinking>/gi,
    /<plan>/gi,
    /<\/plan>/gi,
    /<reflection>/gi,
    /<\/reflection>/gi,
    /<tool_call>/gi,
    /<\/tool_call>/gi,
    /<function_call>/gi,
    /<\/function_call>/gi,
    /<tool_use>/gi,
    /<\/tool_use>/gi,
    // Pipe-style tags: <|tagname|> format from Gemini / Qwen / Mistral
    /<\|toolcallssectionbegin\|>/gi,
    /<\|toolcallssectionend\|>/gi,
    /<\|toolcallsectionbegin\|>/gi,
    /<\|toolcallsectionend\|>/gi,
    /<\|toolcallbegin\|>/gi,
    /<\|toolcallend\|>/gi,
    /<\|toolcallargumentbegin\|>/gi,
    /<\|toolcallargumentend\|>/gi,
    /<\|tool_calls_section_begin\|>/gi,
    /<\|tool_calls_section_end\|>/gi,
    // Generic catcher: <|anything|>
    /<\|[a-z_]{2,40}\|>/gi,
  ];

  // Strip semua tag dari string
  static strip(text: string): string {
    let result = text;
    for (const pattern of TagStripper.STRIP_PATTERNS) {
      result = result.replace(pattern, "");
    }
    return result;
  }

  // Cek apakah string mengandung thinking block
  static hasThinkingBlock(text: string): boolean {
    return /<think>|<thinking>/i.test(text);
  }

  // Ekstrak konten di dalam thinking block (untuk parsing)
  static extractThinking(text: string): string | null {
    const match = text.match(/<(?:think|thinking)>([\s\S]*?)<\/(?:think|thinking)>/i);
    return match ? match[1].trim() : null;
  }

  // Ekstrak konten di luar thinking block (yang tampil sebagai respons biasa)
  static extractResponse(text: string): string {
    return text
      .replace(/<(?:think|thinking)>([\s\S]*?)<\/(?:think|thinking)>/gi, "")
      .trim();
  }

  // Streaming state machine — track apakah sedang di dalam tag
  static createStreamingFilter(): StreamingTagFilter {
    return new StreamingTagFilter();
  }
}

/**
 * Filter untuk streaming — track state buka/tutup tag
 * Mendukung deteksi tool_call XML yang bocor dari model sebagai text-delta.
 */
export class StreamingTagFilter {
  private buffer = "";
  private insideTag = false;
  private tagDepth = 0;
  private currentTagType: "thinking" | "tool_call" | "function_call" | "plan" | "reflection" | null = null;
  private tagStack: Array<"thinking" | "tool_call" | "function_call" | "plan" | "reflection"> = [];

  // ── Pipe-style tag state machine ──────────────────────────────────────
  // Beberapa model (Gemini, Qwen, Mistral) emit tool calls sebagai text biasa
  // dengan format <|tagname|> bukan XML. Kita harus filter seluruh bloknnya.
  private insidePipeTag = false;
  // Regex untuk mendeteksi SEMUA varian pipe tag dalam satu pass
  private static readonly PIPE_TAG_OPEN_RE = /^<\|(?:toolcalls?section|toolcall|toolcallargument|tool_calls?_section|function)?(?:begin|start)\|>/i;
  private static readonly PIPE_TAG_CLOSE_RE = /^<\|(?:toolcalls?section|toolcall|toolcallargument|tool_calls?_section|function)?(?:end|stop)\|>/i;
  private static readonly PIPE_TAG_ANY_RE = /^<\|[a-z_]{2,40}\|>/i;

  // Tag yang harus disembunyikan dari display
  private static readonly HIDDEN_TAG_PREFIXES = [
    "<think",          // <think> dan <thinking>
    "<thought",        // <thought> dan <thought_process>
    "<analysis",       // <analysis>
    "<reasoning",      // <reasoning>
    "<tool_call",      // <tool_call> format Nemotron/Llama
    "<function_call",  // <function_call> format lama
    "<tool_use",       // <tool_use> format Anthropic text-mode
    "<tool_response",  // response dari tool (kalau ada)
    "<function_response",
    "<plan",
    "<reflection",
    "<internal_monologue",
  ];

  // Tag penutup yang bersesuaian
  private static readonly HIDDEN_CLOSE_PREFIXES = [
    "</think",
    "</thought",
    "</analysis",
    "</reasoning",
    "</tool_call",
    "</function_call",
    "</tool_use",
    "</tool_response",
    "</function_response",
    "</plan",
    "</reflection",
    "</internal_monologue",
  ];

  feed(token: string): { display: string; thinking: string; toolCallText: string; tagType: string | null } {
    this.buffer += token;
    let display = "";
    let thinking = "";
    let toolCallText = "";

    while (this.buffer.length > 0) {

      // ── (A) Pipe-style tag handler <|...|> ──────────────────────────────
      // Handle dari dalam pipe tag — sembunyikan sampai closing tag ditemukan
      if (this.insidePipeTag) {
        const closeMatch = this.buffer.match(StreamingTagFilter.PIPE_TAG_ANY_RE);
        if (closeMatch) {
          // Ketemu tag pipe (bisa close atau apapun), konsumsi dan lanjut
          // Cek apakah ini closing tag
          if (StreamingTagFilter.PIPE_TAG_CLOSE_RE.test(this.buffer)) {
            this.insidePipeTag = false;
          }
          this.buffer = this.buffer.slice(closeMatch[0].length);
          continue;
        }
        // Belum ada closing tag — cek kalau buffer punya <| tapi belum lengkap
        const pipeStart = this.buffer.indexOf("<|");
        if (pipeStart !== -1) {
          // Buang teks sebelum <| lalu tunggu
          toolCallText += this.buffer.slice(0, pipeStart);
          this.buffer = this.buffer.slice(pipeStart);
          if (this.buffer.length < 40) break; // Tunggu tag lengkap
          // Kalau sudah 40+ chars tapi tidak match, bukan tag — output sebagai toolCall dan lewati
          toolCallText += this.buffer[0];
          this.buffer = this.buffer.slice(1);
        } else {
          // Tidak ada <| di buffer, sembunyikan semua isinya
          toolCallText += this.buffer;
          this.buffer = "";
        }
        continue;
      }

      // ── (B) Deteksi pembuka pipe tag <|..begin|> ────────────────────────
      if (this.buffer.startsWith("<|")) {
        // Kalau ketemu opening tag pipe yang kita kenal
        if (StreamingTagFilter.PIPE_TAG_OPEN_RE.test(this.buffer)) {
          const endIdx = this.buffer.indexOf("|>");
          if (endIdx === -1) {
            // Tag belum lengkap, tunggu
            if (this.buffer.length < 60) break;
            // Terlalu panjang dan tidak match — output sebagai teks biasa
            display += this.buffer[0];
            this.buffer = this.buffer.slice(1);
            continue;
          }
          this.insidePipeTag = true;
          this.buffer = this.buffer.slice(endIdx + 2); // Lewati |>
          continue;
        }
        // Generic pipe tag catcher — <|apapun|> yang tidak dikenal
        if (StreamingTagFilter.PIPE_TAG_ANY_RE.test(this.buffer)) {
          const m = this.buffer.match(StreamingTagFilter.PIPE_TAG_ANY_RE)!;
          this.buffer = this.buffer.slice(m[0].length);
          continue;
        }
        // <| tapi belum lengkap — tunggu
        if (this.buffer.length < 40) break;
      }

      // ── (C) XML-style hidden tag (yang sudah ada sebelumnya) ───────────
      // Cek apakah buffer dimulai dengan hidden tag pembuka
      const openTag = StreamingTagFilter.HIDDEN_TAG_PREFIXES.find(
        prefix => this.buffer.startsWith(prefix)
      );

      if (openTag) {
        const closingBracket = this.buffer.indexOf(">");
        if (closingBracket === -1) {
          // Tag belum lengkap, tunggu lebih banyak token, kecuali jika buffer sudah terlalu panjang
          if (this.buffer.length > 100) {
            display += this.buffer[0];
            this.buffer = this.buffer.slice(1);
            continue;
          }
          break;
        }

        // Tag lengkap — masuk mode hidden
        this.insideTag = true;
        this.tagDepth++;
        
        // Push current type to stack before overwriting (untuk nested tag support)
        if (this.currentTagType !== null) {
          this.tagStack.push(this.currentTagType);
        }

        // Determine tag type
        if (openTag.startsWith("<think") || openTag.startsWith("<thought") || openTag.startsWith("<analysis") || openTag.startsWith("<reasoning") || openTag.startsWith("<internal")) {
          this.currentTagType = "thinking";
        } else if (openTag.startsWith("<tool_call") || openTag.startsWith("<tool_use")) {
          this.currentTagType = "tool_call";
        } else if (openTag.startsWith("<function_call")) {
          this.currentTagType = "function_call";
        } else if (openTag.startsWith("<plan")) {
          this.currentTagType = "plan";
        } else if (openTag.startsWith("<reflection")) {
          this.currentTagType = "reflection";
        }

        this.buffer = this.buffer.slice(closingBracket + 1);
        continue;
      }

      // Cek tag penutup
      const closeTag = StreamingTagFilter.HIDDEN_CLOSE_PREFIXES.find(
        prefix => this.buffer.startsWith(prefix)
      );

      if (closeTag) {
        const closingBracket = this.buffer.indexOf(">");
        if (closingBracket === -1) {
          if (this.buffer.length > 100) {
            if (this.insideTag) {
               if (this.currentTagType === "thinking") thinking += this.buffer[0];
               else toolCallText += this.buffer[0];
            } else display += this.buffer[0];
            this.buffer = this.buffer.slice(1);
            continue;
          }
          break;
        }

        this.tagDepth = Math.max(0, this.tagDepth - 1);
        if (this.tagDepth === 0) {
          this.insideTag = false;
          this.currentTagType = null;
          this.tagStack = [];
        } else {
          // Kembalikan ke parent tag type
          this.currentTagType = this.tagStack.pop() ?? null;
        }
        this.buffer = this.buffer.slice(closingBracket + 1);
        continue;
      }

      // Buffer dimulai dengan "<" tapi bukan prefix dari hidden tag manapun
      if (this.buffer[0] === "<") {
        // Cek apakah buffer bisa jadi AWAL dari hidden tag yang valid
        const isPrefix = StreamingTagFilter.HIDDEN_TAG_PREFIXES.some(p => p.startsWith(this.buffer)) ||
                         StreamingTagFilter.HIDDEN_CLOSE_PREFIXES.some(p => p.startsWith(this.buffer));
        
        if (isPrefix) {
          // Mungkin awal hidden tag, tunggu kelengkapan (max 20 chars)
          if (this.buffer.length < 20) break;
        }
        // Jika bukan prefix potensial (misal <a href=), fall through dan langsung output
      }

      // Output karakter
      const char = this.buffer[0];
      this.buffer = this.buffer.slice(1);

      if (this.insideTag) {
        if (this.currentTagType === "thinking") {
          thinking += char;
        } else {
          toolCallText += char; // Simpan tapi jangan tampilkan
        }
      } else {
        display += char;
      }
    }

    return { display, thinking, toolCallText, tagType: this.currentTagType };
  }

  flush(): { display: string; thinking: string; toolCallText: string } {
    const remaining = this.buffer;
    this.buffer = "";
    if (this.insideTag) {
      if (this.currentTagType === "thinking") return { display: "", thinking: remaining, toolCallText: "" };
      return { display: "", thinking: "", toolCallText: remaining };
    }
    return { display: remaining, thinking: "", toolCallText: "" };
  }

  reset(): void {
    this.buffer = "";
    this.insideTag = false;
    this.insidePipeTag = false;
    this.tagDepth = 0;
    this.currentTagType = null;
    this.tagStack = [];
  }
}

