import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionRequest, UserQuestionService } from '@deepseek-ai/dsh-user-questions'
import { approvalOf } from '../src/host/harness/codex/index.ts'
import { dshInteractions } from '../src/host/interactions.ts'

const cancelled = () => Object.assign(new Error('the user cancelled ask_user_question'), { name: 'UserQuestionError', code: 'ASK_CANCELLED' })

function ports(answer: (request: AskUserQuestionRequest) => Promise<unknown>, policy = 'never') {
  const asked: AskUserQuestionRequest[] = []
  const interactions = dshInteractions({
    agent: { session: {} } as unknown as Agent,
    harnessName: 'Codex',
    approval: { overrideOf: () => policy, config: { policy } } as unknown as ApprovalService,
    questions: {
      ask: (request: AskUserQuestionRequest) => {
        asked.push(request)
        return answer(request)
      },
    } as unknown as UserQuestionService,
    callIdOf: (tool) => `nh_${tool}`,
  })
  return { interactions, asked }
}
const signal = new AbortController().signal

test('closing an approval card denies the request', async () => {
  const { interactions } = ports(async () => {
    throw cancelled()
  })
  assert.deepEqual(await interactions.approve({ tool: 't', title: 'Shell', reason: 'rm -rf build' }, signal), { kind: 'deny' })
})

test('closing a question card comes back dismissed', async () => {
  const { interactions } = ports(async () => {
    throw cancelled()
  })
  const answer = await interactions.ask([{ id: 'q', header: 'h', question: 'Which?', options: [{ label: 'A' }] }], signal)
  assert.equal(answer.dismissed, true)
})

test('an aborted request still rejects', async () => {
  const controller = new AbortController()
  const { interactions } = ports(async () => {
    controller.abort()
    throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' })
  })
  await assert.rejects(interactions.approve({ tool: 't', title: 'Shell', reason: 'x' }, controller.signal))
})

test('without a plain allow-once only the native choices and deny are offered', async () => {
  const { interactions, asked } = ports(async (request) => ({
    answers: [{ id: 'decision', selected: [request.questions[0]!.options![0]!.label] }],
  }))
  const decision = await interactions.approve(
    { tool: 't', title: 'Shell', reason: 'curl example.com', allowOnce: false, choices: [{ id: '0', label: 'Allow example.com from now on' }] },
    signal,
  )
  assert.deepEqual(decision, { kind: 'choice', id: '0' })
  assert.deepEqual(asked[0]!.questions[0]!.options!.map((option) => option.label), ['Allow example.com from now on', 'Deny / 拒绝'])
})

test('a plan is reviewed on the plan-review card and closing it asks for revisions', async () => {
  let approve = true
  const { interactions, asked } = ports(async (request) => {
    if (!approve) throw cancelled()
    const intent = request.questions[0]!.intent!
    return { answers: [{ id: request.questions[0]!.id, selected: [intent.approve] }] }
  })
  assert.equal(await interactions.reviewPlan('# Plan\n\n1. Do it', signal), 'approve')
  const question = asked[0]!.questions[0]!
  assert.equal(question.intent?.kind, 'plan-review')
  assert.equal(question.detail, '# Plan\n\n1. Do it')
  assert.equal(question.intent?.callId, undefined)
  approve = false
  assert.equal(await interactions.reviewPlan('# Plan', signal), 'revise')
})

test('Codex approvals without a plain accept offer the native decisions instead of denying', () => {
  const available = [{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ['npm', 'test'] } }, 'decline', 'cancel']
  const offer = approvalOf(available)
  assert.equal(offer.allowOnce, false)
  assert.equal(offer.choices.length, 1)
  assert.match(offer.choices[0]!.label, /npm test/)
  assert.deepEqual(offer.decide({ kind: 'choice', id: offer.choices[0]!.id }), available[0])
  assert.equal(offer.decide({ kind: 'deny' }), 'decline')
  const plain = approvalOf(['accept', 'acceptForSession', 'decline'])
  assert.equal(plain.allowOnce, true)
  assert.deepEqual(plain.choices, [])
  assert.equal(plain.decide({ kind: 'allow' }), 'accept')
  assert.equal(approvalOf(undefined).decide({ kind: 'allow' }), 'accept')
})
