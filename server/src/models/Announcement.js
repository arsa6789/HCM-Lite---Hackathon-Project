import { defineModel } from "./firestoreModel.js";

const Announcement = defineModel("announcements", {
  defaults: { audience: { type: "all", role: null, departmentId: null }, pinned: false },
});
export default Announcement;
