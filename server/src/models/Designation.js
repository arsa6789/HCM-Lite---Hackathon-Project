import { defineModel } from "./recordModel.js";

const Designation = defineModel("designations", { defaults: { description: "" }, unique: ["name"] });
export default Designation;
