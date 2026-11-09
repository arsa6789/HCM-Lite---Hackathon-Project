import { defineModel } from "./recordModel.js";

const Notification = defineModel("notifications", { defaults: { body: "", type: "system", link: "", read: false } });
export default Notification;
