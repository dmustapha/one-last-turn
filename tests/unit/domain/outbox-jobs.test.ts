import { expectTypeOf, it } from "vitest";

import type { OutboxJob } from "@/contracts/jobs/outbox-jobs";
import type { AccessEventId, ContactEventId } from "@/domain/shared/ids";

type AccessJob = Extract<OutboxJob, { type: "apply_room_access" }>;
type ContactJob = Exclude<OutboxJob, AccessJob>;

it("binds access jobs exclusively to access-lane event identifiers", () => {
  expectTypeOf<AccessJob["sourceEventId"]>().toEqualTypeOf<AccessEventId>();
});

it("binds contact jobs exclusively to contact-lane event identifiers", () => {
  expectTypeOf<ContactJob["sourceEventId"]>().toEqualTypeOf<ContactEventId>();
});
