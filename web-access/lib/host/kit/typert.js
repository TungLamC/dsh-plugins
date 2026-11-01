/** Register a row's Remote descriptors with Typert for as long as the row runs. */
export function registerHost(ctx, contribution) {
    ctx.effect(() => ctx.typert.register({
        package: contribution.package,
        face: 'host',
        schemas: [],
        model: { services: [], events: [], objects: [] },
        invocations: contribution.descriptors,
    }), `${contribution.package}: Remote descriptors`);
}
