import { defineModel } from "./firestoreModel.js";
import Department from "./Department.js";
import Designation from "./Designation.js";

const User = defineModel("users", {
  defaults: { role: "employee", fullName: "", phone: "", address: "", employmentStatus: "active", salary: { basic: 0, allowance: 0, currency: "PKR" } },
  unique: ["email", "employeeCode"],
  references: { departmentId: Department, designationId: Designation },
});

export default User;
