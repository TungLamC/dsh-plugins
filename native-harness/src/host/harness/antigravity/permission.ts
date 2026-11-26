/**
 * `session/request_permission` ⇄ the Interactions port. Options are read by
 * their ACP `kind`; their names are agy's own text, shown as is.
 */
import type { PermissionOption, RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import { text } from '../../../shared/types.ts'
import type { ApprovalDecision, ApprovalRequest, Question, QuestionAnswer } from '../types.ts'

const CANCELLED: RequestPermissionResponse = { outcome: { outcome: 'cancelled' } }
const selected = (option: PermissionOption): RequestPermissionResponse => ({
  outcome: { outcome: 'selected', optionId: option.optionId },
})

/**
 * agy asks its native questions through the permission method, with the
 * answers as options; ACP has no way to say so. agy marks them with an
 * `interaction_` tool call id (T3 Code relies on the same). This is the only
 * agy convention the Adapter depends on: when it changes, a question still
 * works as an approval card listing agy's options.
 */
export function isQuestion(request: RequestPermissionRequest): boolean {
  return request.toolCall.toolCallId.startsWith('interaction_') && request.options.length > 0
}

export function questionOf(request: RequestPermissionRequest): Question {
  return {
    id: request.toolCall.toolCallId,
    header: 'Antigravity',
    question: text(request.toolCall.title).trim() || 'Choose an option. / 请选择。',
    options: request.options.map((option) => ({ label: option.name.trim() || option.optionId })),
  }
}

/** The picked option; a dismissed card or a free-text answer agy cannot take cancels the request. */
export function answerOf(request: RequestPermissionRequest, answer: QuestionAnswer): RequestPermissionResponse {
  if (answer.dismissed) return CANCELLED
  const label = answer.answers.find((item) => item.id === request.toolCall.toolCallId)?.selected[0]
  const option = request.options.find((candidate) => (candidate.name.trim() || candidate.optionId) === label)
  return option ? selected(option) : CANCELLED
}

/**
 * How one approval is offered. The first `allow_once` and `reject_once`
 * options are dsh's own allow and deny buttons; every other option is an
 * extra choice. Without an `allow_once`, agy's allowing options are the only
 * way to allow.
 */
export function approvalOf(
  request: RequestPermissionRequest,
  title: string,
  reason: string,
): { request: ApprovalRequest; decide(decision: ApprovalDecision): RequestPermissionResponse } {
  const once = request.options.find((option) => option.kind === 'allow_once')
  const reject = request.options.find((option) => option.kind === 'reject_once')
  const extra = request.options.filter((option) => option !== once && option !== reject)
  const choices = extra.map((option, index) => ({ id: String(index), label: option.name.trim() || option.optionId }))
  return {
    request: {
      tool: request.toolCall.toolCallId,
      title,
      reason,
      ...(choices.length ? { choices } : {}),
      ...(once ? {} : { allowOnce: false }),
    },
    decide(decision) {
      if (decision.kind === 'allow' && once) return selected(once)
      if (decision.kind === 'choice') {
        const option = extra[Number(decision.id)]
        if (option) return selected(option)
      }
      return reject ? selected(reject) : CANCELLED
    },
  }
}

export { CANCELLED }
