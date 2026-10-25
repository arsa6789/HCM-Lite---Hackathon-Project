import { defineModel } from "./firestoreModel.js";

const Designation = defineModel("designations", { defaults: { description: "" }, unique: ["name"] });
export default Designation;
