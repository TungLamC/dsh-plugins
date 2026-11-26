/**
 * Claude Code's `api_retry` frames: the Agent SDK sends one before each retry
 * of a failed model request, with the attempt, the cap, the delay, the HTTP
 * status (null when no response came back) and an error category.
 */
import { count, object, text } from "../../../shared/types.js";
/** dsh failure code and wording per SDK error category. */
const CATEGORIES = {
    rate_limit: { code: 'RATE_LIMIT', en: 'rate limited', zh: '限流' },
    overloaded: { code: 'SERVER', en: 'overloaded', zh: '服务过载' },
    server_error: { code: 'SERVER', en: 'server error', zh: '服务端出错' },
    authentication_failed: { code: 'AUTH', en: 'authentication failed', zh: '认证失败' },
    billing_error: { code: 'QUOTA', en: 'billing error', zh: '额度或账单问题' },
    invalid_request: { code: 'INVALID_REQUEST', en: 'invalid request', zh: '请求无效' },
    model_not_found: { code: 'UNKNOWN_MODEL', en: 'model not found', zh: '找不到模型' },
};
export function retryCause(frame) {
    if (frame.no_response && typeof frame.no_response === 'object') {
        const seconds = Math.round(count(object(frame.no_response).waited_ms) / 1000);
        return { code: 'TIMEOUT', en: `no response within ${seconds}s`, zh: `${seconds} 秒内没有响应` };
    }
    const status = typeof frame.error_status === 'number' ? frame.error_status : undefined;
    if (status === undefined)
        return { code: 'TRANSPORT', en: 'connection error, no HTTP response', zh: '连接出错，没有收到 HTTP 响应' };
    const category = CATEGORIES[text(frame.error)];
    const code = category?.code ?? (status === 429 ? 'RATE_LIMIT' : status >= 500 ? 'SERVER' : `HTTP_${status}`);
    return {
        code,
        status,
        en: category ? `HTTP ${status} (${category.en})` : `HTTP ${status}`,
        zh: category ? `HTTP ${status}（${category.zh}）` : `HTTP ${status}`,
    };
}
export function retryOf(frame) {
    const cause = retryCause(frame);
    return {
        attempt: count(frame.attempt),
        maxRetries: count(frame.max_retries),
        delayMs: count(frame.retry_delay_ms),
        ...(cause.status !== undefined ? { status: cause.status } : {}),
        code: cause.code,
        reason: `${cause.en} / ${cause.zh}`,
    };
}
function duration(ms) {
    const total = Math.max(1, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (!minutes)
        return { en: `${total}s`, zh: `${total} 秒` };
    return { en: `${minutes}m ${seconds}s`, zh: `${minutes} 分 ${seconds} 秒` };
}
/** Added to the error of a turn that failed while its request was being retried. */
export function retrySummary(retries, elapsedMs, last) {
    const took = duration(elapsedMs);
    const times = retries === 1 ? 'once' : `${retries} times`;
    return (`Claude Code retried the request ${times} over ${took.en}; the last failure was ${last.en}. / ` +
        `Claude Code 重试了 ${retries} 次，历时 ${took.zh}，最后一次失败：${last.zh}。`);
}
