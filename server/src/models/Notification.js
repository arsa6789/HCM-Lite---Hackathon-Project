import { defineModel } from "./firestoreModel.js";

const Notification = defineModel("notifications", { defaults: { body: "", type: "system", link: "", read: false } });
export default Notification;
