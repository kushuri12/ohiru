import { ProviderDef, ModelDef, HiruConfig } from "shared";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createCohere } from "@ai-sdk/cohere";
import { createOllama } from "ai-sdk-ollama";
import chalk from "chalk";

export const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude — best for coding & complex reasoning",
    icon: "",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    apiKeyLabel: "Anthropic API Key",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    supportsCustomModel: false,
    needsBaseUrl: false,
models: [
       {
         id: "claude-3-5-sonnet-latest",
         label: "Claude Sonnet 3.5",
         contextWindow: 200_000,
         maxOutput: 8192,
         inputPricePerM: 3.00,
         outputPricePerM: 15.00,
         capabilities: ["streaming", "tool_use", "vision", "long_context"],
         recommended: true,
       },
       {
         id: "claude-3-5-haiku-latest",
         label: "Claude Haiku 3.5",
         contextWindow: 200_000,
         maxOutput: 8192,
         inputPricePerM: 0.80,
         outputPricePerM: 4.00,
         capabilities: ["streaming", "tool_use", "vision", "fast"],
       },
       {
         id: "claude-3-haiku-20240307",
         label: "Claude 3 Haiku",
         contextWindow: 200_000,
         maxOutput: 4096,
         inputPricePerM: 0.25,
         outputPricePerM: 1.25,
         capabilities: ["streaming", "tool_use", "vision", "fast"],
       },
     ],
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT-4o, o1, o3 — most popular, broad ecosystem",
    icon: "",
    apiKeyEnv: "OPENAI_API_KEY",
    apiKeyLabel: "OpenAI API Key",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    supportsCustomModel: true,
    needsBaseUrl: false,
models: [
       {
         id: "gpt-4o",
         label: "GPT-4o",
         contextWindow: 128_000,
         maxOutput: 16_384,
         inputPricePerM: 2.50,
         outputPricePerM: 10.00,
         capabilities: ["streaming", "tool_use", "vision"],
         recommended: true,
       },
       {
         id: "gpt-4o-mini",
         label: "GPT-4o Mini",
         contextWindow: 128_000,
         maxOutput: 16_384,
         inputPricePerM: 0.15,
         outputPricePerM: 0.60,
         capabilities: ["streaming", "tool_use", "vision", "fast"],
       },
       {
         id: "o3-mini",
         label: "o3-mini",
         contextWindow: 200_000,
         maxOutput: 100_000,
         inputPricePerM: 1.10,
         outputPricePerM: 4.40,
         capabilities: ["streaming", "tool_use", "reasoning", "fast"],
       },
       {
         id: "o1-preview",
         label: "o1 Preview",
         contextWindow: 128_000,
         maxOutput: 32_768,
         inputPricePerM: 15.00,
         outputPricePerM: 60.00,
         capabilities: ["streaming", "tool_use", "reasoning"],
       },
       {
         id: "o1-mini",
         label: "o1 Mini",
         contextWindow: 128_000,
         maxOutput: 65_536,
         inputPricePerM: 3.00,
         outputPricePerM: 12.00,
         capabilities: ["streaming", "tool_use", "reasoning", "fast"],
       },
       {
         id: "gpt-4-turbo",
         label: "GPT-4 Turbo",
         contextWindow: 128_000,
         maxOutput: 4096,
         inputPricePerM: 10.00,
         outputPricePerM: 30.00,
         capabilities: ["streaming", "tool_use", "vision"],
       },
       {
         id: "gpt-4",
         label: "GPT-4",
         contextWindow: 8_192,
         maxOutput: 4096,
         inputPricePerM: 30.00,
         outputPricePerM: 60.00,
         capabilities: ["streaming", "tool_use"],
       },
       {
         id: "gpt-3.5-turbo",
         label: "GPT-3.5 Turbo",
         contextWindow: 16_385,
         maxOutput: 4096,
         inputPricePerM: 0.50,
         outputPricePerM: 1.50,
         capabilities: ["streaming", "tool_use", "fast"],
       },
     ],
  },
  {
    id: "google",
    label: "Google",
    description: "Gemini — largest context window, free tier available",
    icon: "",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    apiKeyLabel: "Google AI API Key",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    supportsCustomModel: false,
    needsBaseUrl: false,
models: [
       {
         id: "gemini-2.5-pro",
         label: "Gemini 2.5 Pro",
         contextWindow: 1_048_576,
         maxOutput: 8192,
         inputPricePerM: 1.25,
         outputPricePerM: 10.00,
         capabilities: ["streaming", "tool_use", "vision", "long_context", "reasoning"],
         recommended: true,
       },
       {
         id: "gemini-2.0-flash",
         label: "Gemini 2.0 Flash",
         contextWindow: 1_048_576,
         maxOutput: 8192,
         inputPricePerM: 0.00,
         outputPricePerM: 0.00,
         capabilities: ["streaming", "tool_use", "vision", "fast", "free"],
       },
       {
         id: "gemini-1.5-flash",
         label: "Gemini 1.5 Flash",
         contextWindow: 1_048_576,
         maxOutput: 8192,
         inputPricePerM: 0.075,
         outputPricePerM: 0.30,
         capabilities: ["streaming", "tool_use", "vision", "long_context", "fast"],
       },
       {
         id: "gemini-1.5-pro",
         label: "Gemini 1.5 Pro",
         contextWindow: 2_097_152,
         maxOutput: 8192,
         inputPricePerM: 1.25,
         outputPricePerM: 5.00,
         capabilities: ["streaming", "tool_use", "vision", "long_context"],
       },
     ],
  },
  {
    id: "groq",
    label: "Groq",
    description: "Llama & Mixtral on custom hardware — FASTEST in the world",
    icon: "",
    apiKeyEnv: "GROQ_API_KEY",
    apiKeyLabel: "Groq API Key",
    apiKeyUrl: "https://console.groq.com/keys",
    supportsCustomModel: false,
    needsBaseUrl: false,
models: [
       {
         id: "llama-3.3-70b-versatile",
         label: "Llama 3.3 70B",
         contextWindow: 128_000,
         maxOutput: 32_768,
         inputPricePerM: 0.59,
         outputPricePerM: 0.79,
         capabilities: ["streaming", "tool_use", "fast"],
         recommended: true,
       },
       {
         id: "llama-3.1-70b-versatile",
         label: "Llama 3.1 70B",
         contextWindow: 128_000,
         maxOutput: 32_768,
         inputPricePerM: 0.70,
         outputPricePerM: 0.90,
         capabilities: ["streaming", "tool_use", "fast"],
       },
       {
         id: "mixtral-8x7b-32768",
         label: "Mixtral 8x7B",
         contextWindow: 32_768,
         maxOutput: 32_768,
         inputPricePerM: 0.24,
         outputPricePerM: 0.24,
         capabilities: ["streaming", "tool_use", "fast"],
       },
       {
         id: "llama3-70b-8192",
         label: "Llama 3 70B",
         contextWindow: 8_192,
         maxOutput: 8_192,
         inputPricePerM: 0.65,
         outputPricePerM: 2.75,
         capabilities: ["streaming", "tool_use"],
       },
     ],
  },
  {
    id: "mistral",
    label: "Mistral AI",
    description: "Mistral — European models, data privacy, Apache license",
    icon: "",
    apiKeyEnv: "MISTRAL_API_KEY",
    apiKeyLabel: "Mistral API Key",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    supportsCustomModel: false,
    needsBaseUrl: false,
    models: [
      {
        id: "mistral-large-latest",
        label: "Mistral Large",
        contextWindow: 128_000,
        maxOutput: 8_000,
        inputPricePerM: 2.00,
        outputPricePerM: 6.00,
        capabilities: ["streaming", "tool_use"],
        recommended: true,
      },
    ],
  },
  {
    id: "cohere",
    label: "Cohere",
    description: "Command R+ — RAG specialist",
    icon: "",
    apiKeyEnv: "COHERE_API_KEY",
    apiKeyLabel: "Cohere API Key",
    apiKeyUrl: "https://dashboard.cohere.com/api-keys",
    supportsCustomModel: false,
    needsBaseUrl: false,
    models: [
      {
        id: "command-r-plus",
        label: "Command R+",
        contextWindow: 128_000,
        maxOutput: 4_000,
        inputPricePerM: 2.50,
        outputPricePerM: 10.00,
        capabilities: ["streaming", "tool_use"],
        recommended: true,
      },
      {
        id: "command-r",
        label: "Command R",
        contextWindow: 128_000,
        maxOutput: 4_000,
        inputPricePerM: 0.30,
        outputPricePerM: 1.00,
        capabilities: ["streaming", "tool_use", "fast"],
      },
      {
        id: "command-r7b-langchain-instruct",
        label: "Command R 7B",
        contextWindow: 128_000,
        maxOutput: 4_000,
        inputPricePerM: 0.20,
        outputPricePerM: 0.60,
        capabilities: ["streaming", "fast"],
      },
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    description: "Grok — realtime web access",
    icon: "",
    apiKeyEnv: "XAI_API_KEY",
    apiKeyLabel: "xAI API Key",
    apiKeyUrl: "https://console.x.ai",
    supportsCustomModel: true,
    needsBaseUrl: false,
    models: [
      {
        id: "grok-2",
        label: "Grok 2",
        contextWindow: 131_072,
        maxOutput: 8_192,
        inputPricePerM: 3.00,
        outputPricePerM: 15.00,
        capabilities: ["streaming", "tool_use"],
        recommended: true,
      },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "300+ models from 50+ providers",
    icon: "",
    apiKeyEnv: "OPENROUTER_API_KEY",
    apiKeyLabel: "OpenRouter API Key",
    apiKeyUrl: "https://openrouter.ai/keys",
    supportsCustomModel: true,
    needsBaseUrl: false,
    models: [
      {
        id: "anthropic/claude-3-5-sonnet",
        label: "Claude Sonnet 3.5 (OR)",
        contextWindow: 200_000,
        maxOutput: 8192,
        inputPricePerM: 3.00,
        outputPricePerM: 15.00,
        capabilities: ["streaming", "tool_use"],
        recommended: true,
      },
      {
        id: "mistral-small-latest",
        label: "Mistral Small",
        contextWindow: 128_000,
        maxOutput: 8_000,
        inputPricePerM: 0.20,
        outputPricePerM: 0.60,
        capabilities: ["streaming", "tool_use", "fast"],
      },
      {
        id: "mistral-tiny",
        label: "Mistral Tiny",
        contextWindow: 128_000,
        maxOutput: 4_096,
        inputPricePerM: 0.04,
        outputPricePerM: 0.04,
        capabilities: ["streaming", "fast"],
      },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek — strongest reasoning model, very cheap",
    icon: "",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    apiKeyLabel: "DeepSeek API Key",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    supportsCustomModel: false,
    needsBaseUrl: false,
models: [
       {
         id: "deepseek-chat",
         label: "DeepSeek V3",
         contextWindow: 64_000,
         maxOutput: 8_000,
         inputPricePerM: 0.27,
         outputPricePerM: 1.10,
         capabilities: ["streaming", "tool_use"],
         recommended: true,
       },
       {
         id: "deepseek-coder",
         label: "DeepSeek Coder V2",
         contextWindow: 64_000,
         maxOutput: 8_000,
         inputPricePerM: 0.27,
         outputPricePerM: 1.10,
         capabilities: ["streaming", "tool_use", "coding"],
       },
       {
         id: "deepseek-reasoner",
         label: "DeepSeek Reasoner",
         contextWindow: 64_000,
         maxOutput: 8_000,
         inputPricePerM: 0.55,
         outputPricePerM: 2.19,
         capabilities: ["streaming", "reasoning"],
       },
     ],
  },
  {
    id: "ollama",
    label: "Ollama (Local)",
    description: "Run models OFFLINE on your own machine — FREE, private",
    icon: "",
    apiKeyEnv: "OLLAMA_API_KEY",
    apiKeyLabel: "",
    apiKeyUrl: "https://ollama.com/download",
    supportsCustomModel: true,
    needsBaseUrl: true,
    models: [
      {
        id: "qwen2.5-coder:32b",
        label: "Qwen 2.5 Coder 32B",
        contextWindow: 32_768,
        maxOutput: 8_000,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "tool_use", "local", "free"],
        recommended: true,
      },
    ],
  },
  {
    id: "minimax",
    label: "Minimax AI",
    description: "Minimax — specialized in high-reasoning and logic tasks",
    icon: "",
    apiKeyEnv: "MINIMAX_API_KEY",
    apiKeyLabel: "Minimax API Key",
    apiKeyUrl: "https://platform.minimaxi.com",
    supportsCustomModel: true,
    needsBaseUrl: true,
    models: [
      {
        id: "minimax-m2.5",
        label: "Minimax M2.5 (Reasoning)",
        contextWindow: 128_000,
        maxOutput: 8_192,
        inputPricePerM: 0, 
        outputPricePerM: 0,
        capabilities: ["streaming", "tool_use", "reasoning"],
        recommended: true,
      },
    ],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    description: "Self-hosted LLM, LM Studio, Jan, vLLM, LocalAI, or other providers",
    icon: "",
    apiKeyEnv: "CUSTOM_AI_API_KEY",
    apiKeyLabel: "API Key (leave blank if strictly local)",
    apiKeyUrl: "",
    supportsCustomModel: true,
    needsBaseUrl: true,
    models: [],
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM API",
    description: "NVIDIA — fast Inference for Llama, Nemotron & Mistral",
    icon: "",
    apiKeyEnv: "NVIDIA_API_KEY",
    apiKeyLabel: "NVIDIA API Key",
    apiKeyUrl: "https://build.nvidia.com",
    supportsCustomModel: true,
    needsBaseUrl: false,
    models: [
      {
        id: "meta/llama-3.3-70b-instruct",
        label: "Llama 3.3 70B",
        contextWindow: 128_000,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "tool_use", "fast"],
        recommended: true,
      },
      {
        id: "meta/llama-3.1-405b-instruct",
        label: "Llama 3.1 405B",
        contextWindow: 128_000,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "reasoning"],
      },
      {
        id: "meta/llama-3.1-70b-instruct",
        label: "Llama 3.1 70B",
        contextWindow: 128_000,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "fast"],
      },
      {
        id: "nvidia/llama-3.1-nemotron-70b-instruct",
        label: "Nemotron 70B",
        contextWindow: 128_000,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "tool_use", "fast"],
      },
      {
        id: "nvidia/nemotron-4-340b-instruct",
        label: "Nemotron 4 340B",
        contextWindow: 4096,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming"],
      },
      {
        id: "mistralai/mixtral-8x22b-instruct-v0.1",
        label: "Mixtral 8x22B",
        contextWindow: 65_536,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "fast"],
      },
      {
        id: "mistralai/mistral-large-2-instruct",
        label: "Mistral Large 2",
        contextWindow: 128_000,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "tool_use"],
      },
      {
        id: "meta/llama-3.2-3b-instruct",
        label: "Llama 3.2 3B",
        contextWindow: 128_000,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "fast"],
      },
      {
        id: "google/gemma-2-27b-instruct",
        label: "Gemma 2 27B",
        contextWindow: 8_000,
        maxOutput: 4096,
        inputPricePerM: 0,
        outputPricePerM: 0,
        capabilities: ["streaming", "fast"],
      },
    ],
  },
];

export function getProvider(id: string): ProviderDef {
  const p = PROVIDERS.find(p => p.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function createProviderInstance(config: HiruConfig): any {
  const provider = config.provider?.trim();
  const model = config.model?.trim();
  
  // Prefer provider-specific key from the new apiKeys map
  let apiKey = config.apiKeys?.[provider] || config.apiKey?.trim();

  // Fallback to env variables if keychain returned nothing
  if (!apiKey || apiKey === "dummy") {
      const envKeyName = PROVIDERS.find(p => p.id === provider)?.apiKeyEnv;
      apiKey = process.env[envKeyName || ""] || process.env.HIRU_API_KEY || process.env.OPENAI_API_KEY || "dummy";
  }

  if (apiKey === "dummy" && provider !== "ollama") {
      console.warn(chalk.yellow(`\n⚠️  No API key found for ${provider}. Calling might fail with 401 Unauthorized.`));
      console.warn(chalk.dim(`   Run 'hiru provider switch' to set your key correctly.\n`));
  }

  const baseUrl = config.baseUrl?.trim();

  switch (provider) {
    case "anthropic":  return createAnthropic({ apiKey })(model);
    case "openai":     return createOpenAI({ apiKey }).chat(model);
    case "google":     return createGoogleGenerativeAI({ apiKey })(model);
    case "groq":       return createGroq({ apiKey })(model);
    case "mistral":    return createMistral({ apiKey })(model);
    case "cohere":     return createCohere({ apiKey })(model);
    
    // Using OpenAI compatible adapters for these based on baseUrl updates:
    case "xai":        
      return createOpenAI({ apiKey, baseURL: "https://api.x.ai/v1" }).chat(model);
    case "deepseek":   
      return createOpenAI({ apiKey, baseURL: "https://api.deepseek.com" }).chat(model);
    case "openrouter": 
      return createOpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" }).chat(model);
    case "custom": {
      // Auto-strip /chat/completions if user accidentally pasted full endpoint
      const safeUrl = baseUrl?.replace(/\/chat\/completions\/?$/, "") || "";
      return createOpenAI({ apiKey, baseURL: safeUrl }).chat(model);
    }
    case "ollama": {
      let finalOllamaUrl = baseUrl?.replace(/\/api\/?$/, "") ?? "http://localhost:11434";
      if (!finalOllamaUrl || finalOllamaUrl.includes("api.nvidia.com") || finalOllamaUrl.includes("api.openai.com") || finalOllamaUrl.includes("api.groq.com")) {
         finalOllamaUrl = "http://localhost:11434";
      }
      
      const headers: Record<string, string> = {};
      if (apiKey && apiKey !== "dummy") {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      
      const ollama = createOllama({ 
        baseURL: finalOllamaUrl,
        headers
      });
      return ollama(model);
    }
    case "minimax":
      return createOpenAI({ apiKey, baseURL: baseUrl || "https://api.minimaxi.chat/v1" }).chat(model);
    case "nvidia":
      return createOpenAI({ apiKey, baseURL: "https://integrate.api.nvidia.com/v1" }).chat(model);
      
  }
}

/**
 * Special handling for Anthropic prompt caching.
 * Matches static system prompts and tools for cost optimization.
 */
export function prepareAnthropicMessages(
  systemPrompt: string,
  tools: Record<string, any>,
  messages: any[]
) {
  // Convert tools Record to array of tool definitions
  const toolArray = Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: {
       type: "object",
       properties: def.parameters.shape, // zod schema shape
       required: Object.keys(def.parameters.shape).filter(k => !def.parameters.shape[k].isOptional())
    }
  }));

  // System prompt part with cache breakpoint
  const system = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" }
    }
  ];

  // Tools with cache breakpoint on the last tool
  const cachedTools = toolArray.map((tool, i) => ({
    ...tool,
    ...(i === toolArray.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
  }));

  return { system, tools: cachedTools, messages };
}

/**
 * Pre-flight check: verify Ollama is actually running before attempting any LLM call.
 * Returns null if OK, or a human-readable error string if it is unreachable.
 */
/**
 * Verify if a specific model is available in Ollama, and pull it if not.
 */
export async function ensureOllamaModel(baseUrl: string | undefined, modelName: string, onProgress?: (msg: string) => void): Promise<void> {
  let url = baseUrl?.trim() || "http://localhost:11434";
  url = url.replace(/\/api\/?$/, "");

  // 1. Check if model exists
  try {
    const res = await fetch(`${url}/api/tags`);
    if (res.ok) {
      const data: any = await res.json();
      const models = data.models || [];
      const exists = models.some((m: any) => 
        m.name === modelName || 
        m.name === `${modelName}:latest` ||
        modelName === `${m.name}:latest` ||
        m.name.split(":")[0] === modelName // Match without tag
      );
      
      if (exists) return; 
    }
  } catch (e) {
    console.error("Tags check failed", e);
  }

  // 2. Model not found, trigger pull
  onProgress?.(`📥 Model *${modelName}* not found. Pulling from Ollama registry...`);
  
  try {
    const response = await fetch(`${url}/api/pull`, {
      method: "POST",
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Ollama API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is null");

    let lastReportedPercent = -10;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.status === "downloading" && json.total) {
            const percent = Math.floor((json.completed / json.total) * 100);
            if (percent >= lastReportedPercent + 20) { // Report every 20% to avoid spamming Telegram
              onProgress?.(`📥 Pulling *${modelName}*: ${percent}%`);
              lastReportedPercent = percent;
            }
          } else if (json.status && json.status !== "downloading") {
            // Log other statuses to console for debug
            console.log(`[Ollama Pull] ${json.status}`);
          }
        } catch (e) {
          // Ignore partial JSON
        }
      }
    }
    
    onProgress?.(`✅ Model *${modelName}* pulled and ready.`);
  } catch (e: any) {
    throw new Error(`Failed to pull model "${modelName}": ${e.message}`);
  }
}

export async function checkOllamaConnection(baseUrl?: string): Promise<string | null> {
  let url = baseUrl?.trim() || "http://localhost:11434";
  url = url.replace(/\/api\/?$/, "");
  
  if (
    !url ||
    url.includes("api.nvidia.com") ||
    url.includes("api.openai.com") ||
    url.includes("api.groq.com")
  ) {
    url = "http://localhost:11434";
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return `Ollama returned HTTP ${res.status}. Is the right version installed?`;
    }
    return null; 
  } catch (e: any) {
    const code = e?.cause?.code || e?.code || "";
    const isRefused = code === "ECONNREFUSED" || e?.message?.includes("fetch failed") || e?.name === "AbortError";
    if (isRefused) {
      return (
        `Cannot connect to Ollama at ${url}.\n` +
        `  → Make sure Ollama is running: https://ollama.com/download\n` +
        `  → Then start it with: ollama serve`
      );
    }
    return `Ollama connection error: ${e?.message || e}`;
  }
}

export async function fetchOpenRouterModels(apiKey?: string): Promise<ModelDef[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: controller.signal,
      headers: apiKey && apiKey !== "dummy" ? { "Authorization": `Bearer ${apiKey}` } : {}
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const models: ModelDef[] = (data.data || []).slice(0, 50).map((m: any) => ({
      id: m.id,
      label: m.name || m.id,
      contextWindow: m.context_length || 128_000,
      maxOutput: m.top_provider?.max_tokens || 4096,
      inputPricePerM: m.pricing?.input ? parseFloat(m.pricing.input) * 1_000_000 : 0,
      outputPricePerM: m.pricing?.output ? parseFloat(m.pricing.output) * 1_000_000 : 0,
      capabilities: ["streaming", "tool_use"],
    }));
    return models;
  } catch {
    return [];
  }
}

export async function fetchOllamaModels(baseUrl?: string): Promise<string[]> {
  let url = baseUrl?.trim() || "http://localhost:11434";
  url = url.replace(/\/api\/?$/, "");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).slice(0, 50).map((m: any) => m.name);
  } catch {
    return [];
  }
}

export function getProviderModels(providerId: string): ModelDef[] {
  const provider = PROVIDERS.find(p => p.id === providerId);
  return provider?.models || [];
}

