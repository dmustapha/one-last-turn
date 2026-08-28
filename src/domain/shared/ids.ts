declare const brand: unique symbol;

type Brand<Value, Name extends string> = Value & { readonly [brand]: Name };

export type TenantId = Brand<string, "TenantId">;
export type CaseId = Brand<string, "CaseId">;
export type PrincipalId = Brand<string, "PrincipalId">;
export type GrantId = Brand<string, "GrantId">;
export type RoomId = Brand<string, "RoomId">;
export type MindAlias = Brand<string, "MindAlias">;
export type EventId = Brand<string, "EventId">;
export type AccessEventId = Brand<string, "AccessEventId">;
export type ContactEventId = Brand<string, "ContactEventId">;
export type JobId = Brand<string, "JobId">;
export type ReceiptId = Brand<string, "ReceiptId">;

export function isAccessEventId(value: unknown): value is AccessEventId {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
