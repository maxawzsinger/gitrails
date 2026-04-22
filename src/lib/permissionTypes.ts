import { endpointRegistry } from "./endpointRegistry.js";
import type { RequestForEndpoint } from "./endpointTypes.js";

type EndpointRegistry = typeof endpointRegistry;

// If an action name is present in the permissions object, the agent may call it.
export type ActionName = keyof EndpointRegistry;
export type RequestForAction<TAction extends ActionName> = RequestForEndpoint<
  EndpointRegistry[TAction]
>;
// These are the request param names that may be constrained for an allowed action.
export type ParamNameForAction<TAction extends ActionName> = Exclude<
  keyof RequestForAction<TAction>,
  "actionName"
> &
  string;
// Each present param maps to a regex pattern string. If present, the passed value must match that regex.
export type Perms = Partial<{
  [TAction in ActionName]: Partial<
    Record<
      ParamNameForAction<TAction>,
      string // regex
    >
  >;
}>;
