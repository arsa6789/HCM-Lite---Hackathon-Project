import { defineModel } from "./recordModel.js";

const Holiday = defineModel("holidays", { defaults: { recurring: false } });
export default Holiday;
