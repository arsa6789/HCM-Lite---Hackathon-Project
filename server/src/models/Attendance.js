import { defineModel } from "./firestoreModel.js";
import User from "./User.js";

const Attendance = defineModel("attendance", {
  defaults: { checkInAt: null, checkOutAt: null, status: "present", minutesLate: 0, workedMinutes: 0, source: "web", correction: {} },
  unique: [["userId", "date"]],
  references: { userId: User },
});
export default Attendance;
