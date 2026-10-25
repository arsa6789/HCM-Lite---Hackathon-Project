import { defineModel } from "./firestoreModel.js";

const LeaveType = defineModel("leaveTypes", { defaults: { annualDays: 0, paid: true }, unique: ["name"] });
export default LeaveType;
