import { defineModel } from "./recordModel.js";

const Department = defineModel("departments", { defaults: { description: "" }, unique: ["name"] });
export default Department;
