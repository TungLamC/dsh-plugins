/** The oauth row's Remote contract: account sign-in of pi-ai provider routes, relayed to the Models page. */
import { z } from 'zod';
import { MODULE, providerId, SERVICE } from "./ids.js";
import { defineRemote } from "./remote.js";
export const OAUTH_REMOTE = defineRemote(MODULE.oauth, SERVICE.oauth, {
    watch: { params: [['provider', providerId]], stream: true, signal: true },
    begin: { params: [['provider', providerId], ['method', z.string().min(1).max(64)]], signal: true },
    answer: { params: [['provider', providerId], ['promptId', z.string().min(1).max(64)], ['value', z.string().max(4096)]] },
    cancel: { params: [['provider', providerId]] },
    signOut: { params: [['provider', providerId]] },
});
