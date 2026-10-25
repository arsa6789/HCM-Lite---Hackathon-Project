import { defineModel } from "./firestoreModel.js";

const Department = defineModel("departments", { defaults: { description: "" }, unique: ["name"] });
export default Department;
