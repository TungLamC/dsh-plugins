import { ToolCallId } from '@deepseek-ai/dsh-llm';
const ALLOW = 'Allow once / 允许本次';
const DENY = 'Deny / 拒绝';
const APPROVE_PLAN = 'Approve / 同意执行';
const KEEP_PLANNING = 'Keep planning / 继续规划';
/** The user closed the card; only an aborted signal is a real failure. */
function dismissed(error, signal) {
    return !signal.aborted && error?.code === 'ASK_CANCELLED';
}
export function dshInteractions(deps) {
    const { agent } = deps;
    async function askApproval(request, signal) {
        const choices = request.choices ?? [];
        const answer = await deps.questions
            .ask({
            agent,
            signal,
            questions: [
                {
                    id: 'decision',
                    header: `${deps.harnessName} · ${request.title}`,
                    question: request.reason || request.title,
                    options: [
                        ...(request.allowOnce === false ? [] : [{ label: ALLOW }]),
                        ...choices.map((choice) => ({ label: choice.label, ...(choice.description ? { description: choice.description } : {}) })),
                        { label: DENY },
                    ],
                },
            ],
        })
            .catch((error) => {
            if (dismissed(error, signal))
                return undefined;
            throw error;
        });
        if (!answer)
            return { kind: 'deny' };
        const picked = answer.answers.find((item) => item.id === 'decision');
        const label = picked?.selected[0];
        if (label === ALLOW)
            return { kind: 'allow' };
        const choice = choices.find((item) => item.label === label);
        if (choice)
            return { kind: 'choice', id: choice.id };
        return { kind: 'deny', ...(picked?.custom ? { message: picked.custom } : {}) };
    }
    return {
        async approve(request, signal) {
            // dsh's panel answers by itself under a "never ask" policy; native approvals must always reach the user.
            const policy = deps.approval.overrideOf(agent.session) ?? deps.approval.config?.policy ?? 'ask';
            if (policy !== 'ask' || request.choices?.length || request.allowOnce === false)
                return askApproval(request, signal);
            try {
                const outcome = await deps.approval.request({
                    agent,
                    toolName: `${deps.harnessName} · ${request.title}`,
                    callId: ToolCallId(deps.callIdOf(request.tool)),
                    reason: request.reason,
                    signal,
                });
                return outcome === 'allowed-once' ? { kind: 'allow' } : { kind: 'deny' };
            }
            catch (error) {
                if (signal.aborted)
                    throw error;
                // The panel needs an open dsh turn; outside one, ask through the question card.
                return askApproval(request, signal);
            }
        },
        async ask(questions, signal) {
            const answer = await deps.questions
                .ask({
                agent,
                signal,
                questions: questions.map((question) => ({
                    id: question.id,
                    header: question.header,
                    question: question.question,
                    options: question.options.map((option) => ({
                        label: option.label,
                        ...(option.description ? { description: option.description } : {}),
                    })),
                    ...(question.multiSelect ? { multiSelect: true } : {}),
                })),
            })
                .catch((error) => {
                if (dismissed(error, signal))
                    return undefined;
                throw error;
            });
            if (!answer)
                return { answers: [], dismissed: true };
            return {
                answers: answer.answers.map((item) => ({
                    id: item.id,
                    selected: [...item.selected],
                    ...(item.custom ? { custom: item.custom } : {}),
                })),
            };
        },
        async reviewPlan(plan, signal) {
            // dsh's plan-review card: "Request changes" closes it and hands the composer back for feedback.
            // No callId: that names dsh's own exit_plan_mode call, which the full-plan sidebar would look up.
            const answer = await deps.questions
                .ask({
                agent,
                signal,
                questions: [
                    {
                        id: 'plan',
                        header: `${deps.harnessName} · Plan`,
                        question: 'Approve this plan? / 按这个计划执行？',
                        detail: plan,
                        options: [{ label: APPROVE_PLAN }, { label: KEEP_PLANNING }],
                        intent: { kind: 'plan-review', approve: APPROVE_PLAN },
                    },
                ],
            })
                .catch((error) => {
                if (dismissed(error, signal))
                    return undefined;
                throw error;
            });
            return answer?.answers.find((item) => item.id === 'plan')?.selected[0] === APPROVE_PLAN ? 'approve' : 'revise';
        },
    };
}
