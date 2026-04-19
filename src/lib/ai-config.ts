export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3";
export const GROQ_API_KEY = process.env.GROQ_API_KEY;
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const GROQ_MODEL = process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
