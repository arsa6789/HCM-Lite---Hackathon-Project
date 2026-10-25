import { defineModel } from "./firestoreModel.js";
import User from "./User.js";
import LeaveType from "./LeaveType.js";

const LeaveApplication = defineModel("leaveApplications", {
  defaults: { reason: "", status: "pending", reviewNote: "", reviewedBy: null, reviewedAt: null },
  references: { userId: User, leaveTypeId: LeaveType },
});
export default LeaveApplication;
