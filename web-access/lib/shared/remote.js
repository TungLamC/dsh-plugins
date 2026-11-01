/**
 * One Remote contract per row, shared by both halves: the Host registers its
 * descriptors with Typert and the browser mounts the same ones, so parameters are
 * validated against one schema on both sides. Results are plain JSON the Host
 * builds, so only inputs carry codecs.
 */
/**
 * Describe a row's Remote methods.
 * @param pkg - the module that owns them (one Typert registration per module and face).
 * @param namespace - the wire namespace, which is also the Host service key.
 * @param methods - method specs by method name.
 */
export function defineRemote(pkg, namespace, methods) {
    const descriptors = Object.entries(methods).map(([method, spec]) => {
        const id = `${pkg}#${namespace}/${method}`;
        return {
            id,
            service: namespace,
            namespace,
            method,
            invocation: { kind: 'direct' },
            parameters: spec.params.map(([name, schema]) => ({
                name,
                wire: name,
                source: 'json',
                codec: { mode: 'strict', typeSymbol: `${id}:${name}`, create: () => schema },
            })),
            result: { mode: 'src-json' },
            ...spec.stream === true ? { mode: 'stream' } : {},
            ...spec.signal === true ? { cancellation: { parameter: 'signal' } } : {},
        };
    });
    return { package: pkg, descriptors };
}
