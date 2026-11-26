/**
 * Provider icons in the model menu. dsh's own providers and pi-ai's built-in
 * ones have a mark by their exact route id; a route the user defined has none
 * unless the `providerIcons` option names one: a mark the plugin ships, or an
 * image URL. An empty value hides a built-in provider's mark.
 */

/** Marks the plugin ships (from Lobe Icons); also the names `providerIcons` accepts. */
export const ICON_NAMES = [
  'anthropic',
  'antigravity',
  'azure',
  'baseten',
  'bedrock',
  'cerebras',
  'claude',
  'cloudflare',
  'deepseek',
  'doubao',
  'fireworks',
  'gemini',
  'githubcopilot',
  'google',
  'groq',
  'huggingface',
  'kimi',
  'ling',
  'meta',
  'minimax',
  'mistral',
  'moonshot',
  'nvidia',
  'openai',
  'opencode',
  'openrouter',
  'qwen',
  'together',
  'vercel',
  'vertexai',
  'volcengine',
  'xai',
  'xiaomimimo',
  'zai',
  'zhipu',
] as const
export type IconName = (typeof ICON_NAMES)[number]

/** dsh's DeepSeek providers and pi-ai's built-in providers (as of dsh 0.2.2-rc.5), by route id. */
export const BUILTIN_ICONS: Readonly<Record<string, IconName>> = {
  deepseek: 'deepseek',
  'deepseek-account': 'deepseek',
  'deepseek-official': 'deepseek',
  'amazon-bedrock': 'bedrock',
  'ant-ling': 'ling',
  anthropic: 'anthropic',
  azure: 'azure',
  baseten: 'baseten',
  cerebras: 'cerebras',
  'cloudflare-ai-gateway': 'cloudflare',
  'cloudflare-workers-ai': 'cloudflare',
  fireworks: 'fireworks',
  'github-copilot': 'githubcopilot',
  google: 'google',
  'google-vertex': 'vertexai',
  groq: 'groq',
  huggingface: 'huggingface',
  'kimi-coding': 'kimi',
  meta: 'meta',
  minimax: 'minimax',
  'minimax-cn': 'minimax',
  mistral: 'mistral',
  moonshotai: 'moonshot',
  'moonshotai-cn': 'moonshot',
  nvidia: 'nvidia',
  openai: 'openai',
  'openai-codex': 'openai',
  opencode: 'opencode',
  'opencode-go': 'opencode',
  openrouter: 'openrouter',
  'qwen-token-plan': 'qwen',
  'qwen-token-plan-cn': 'qwen',
  'qwen-token-plan-individual': 'qwen',
  together: 'together',
  'vercel-ai-gateway': 'vercel',
  xai: 'xai',
  xiaomi: 'xiaomimimo',
  'xiaomi-token-plan-ams': 'xiaomimimo',
  'xiaomi-token-plan-cn': 'xiaomimimo',
  'xiaomi-token-plan-sgp': 'xiaomimimo',
  zai: 'zai',
  'zai-coding-cn': 'zhipu',
}

/** An `https:`, `http:` or `data:image/` address, shown as an image. */
export const ICON_URL = /^(https?:\/\/|data:image\/)/i

export type IconSource = { kind: 'mark'; name: IconName } | { kind: 'image'; url: string }

/** A provider's icon: the configured value when there is one (empty hides it), else its built-in mark. */
export function iconOf(provider: string, configured: Readonly<Record<string, string>>): IconSource | undefined {
  const value = Object.hasOwn(configured, provider) ? configured[provider] : BUILTIN_ICONS[provider]
  if (!value) return undefined
  if ((ICON_NAMES as readonly string[]).includes(value)) return { kind: 'mark', name: value as IconName }
  return ICON_URL.test(value) ? { kind: 'image', url: value } : undefined
}
