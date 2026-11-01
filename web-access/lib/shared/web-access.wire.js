/** The row's Remote contract: the models each hosted tier can search with, for the settings page's choices. */
import { PACKAGE, SERVICE } from "./ids.js";
import { defineRemote } from "./remote.js";
export const WEB_ACCESS_REMOTE = defineRemote(PACKAGE, SERVICE, {
    searchModels: { params: [] },
});
