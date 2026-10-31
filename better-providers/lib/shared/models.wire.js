/**
 * The models row's Remote contract: refresh a built-in pi-ai route's model list
 * from the newest pi-ai catalog. A preview lists what changed; applying it writes
 * the chosen list into the route's settings.
 */
import { z } from 'zod';
import { MODULE, modelId, providerId, SERVICE } from "./ids.js";
import { defineRemote } from "./remote.js";
/** Where a route's models are read from: `https://<source>/<route>` answers pi-ai's newest catalog of it. */
export const CATALOG_SOURCE = 'pi.dev/api/models/providers';
const ids = z.array(modelId).max(1000);
export const MODELS_REMOTE = defineRemote(MODULE.models, SERVICE.models, {
    preview: { params: [['provider', providerId]], signal: true },
    apply: { params: [['previewId', z.uuid()], ['choice', z.strictObject({ add: ids, keep: ids })]] },
});
