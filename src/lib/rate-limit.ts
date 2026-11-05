/**
 * Limitador de frequência em memória (janela deslizante simples).
 *
 * Em funções serverless cada instância tem a própria memória, então o limite
 * é "por instância". Ele protege contra rajadas de um mesmo cliente; para um
 * limite global estrito, troque por um armazenamento compartilhado
 * (ex.: Upstash Redis) mantendo esta mesma interface.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}
