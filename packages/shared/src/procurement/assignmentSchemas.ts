import { z } from "zod";

export const StaffAssignmentRoleValues = [
  "RECEIVER",
  "INSPECTOR",
  "APPROVER",
] as const;
export type StaffAssignmentRole = (typeof StaffAssignmentRoleValues)[number];

export interface StaffAssignment {
  id: string;
  goodsReceiptNoteId: string;
  shipmentId: string | null;
  assignedUserId: string;
  assignedRole: StaffAssignmentRole;
  assignedAt: Date;
  createdAt: Date;
}

export const createStaffAssignmentSchema = z.object({
  goodsReceiptNoteId: z
    .string()
    .uuid("Goods Receipt Note ID must be a valid UUID"),
  shipmentId: z
    .string()
    .uuid("Shipment ID must be a valid UUID")
    .optional()
    .nullable(),
  assignedUserId: z.string().uuid("Assigned user ID must be a valid UUID"),
  assignedRole: z.enum(StaffAssignmentRoleValues),
  assignedAt: z.coerce.date().default(() => new Date()),
});

export type CreateStaffAssignmentInput = z.infer<
  typeof createStaffAssignmentSchema
>;
