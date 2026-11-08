import { defineModel } from "./recordModel.js";

const Announcement = defineModel("announcements", {
  defaults: { audience: { type: "all", role: null, departmentId: null }, pinned: false },
});
export default Announcement;
