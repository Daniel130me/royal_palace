import { validate, version, v7 } from "uuid";

export type OpaqueId = string & { readonly opaqueId: unique symbol };

export function createOpaqueId(): OpaqueId {
  return v7() as OpaqueId;
}

export function isOpaqueId(value: string): value is OpaqueId {
  return validate(value) && version(value) === 7;
}
