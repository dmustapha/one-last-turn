import type { AccessWorkflow } from "@/domain/eligibility/access-workflow";
import { deriveGeneralAccess } from "@/domain/eligibility/access-workflow";
import type { ContactWorkflow } from "@/domain/contact/contact-workflow";

export function buildProjectRoomProjection(input: {
  access: AccessWorkflow;
  contact: ContactWorkflow;
}) {
  return {
    generalAccess: deriveGeneralAccess(input.access),
  };
}
