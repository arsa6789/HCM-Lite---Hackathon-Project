import { defineModel } from "./firestoreModel.js";

const Holiday = defineModel("holidays", { defaults: { recurring: false } });
export default Holiday;
