/**
 * Role-neutral destination used after an ordinary sign-in. The client resolves
 * this sentinel to the dashboard authorized by the server-issued session.
 */
export const AUTHENTICATED_LANDING_PATH = "/#/account/dashboard";

export function resolveLoginReturnPath(returnTo: string): string {
  return returnTo === "/" ? AUTHENTICATED_LANDING_PATH : returnTo;
}
