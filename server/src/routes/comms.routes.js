import { Router } from "express";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listNotifications,
  markRead,
  markAllRead,
} from "../controllers/comms.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const announcementRouter = Router();
const notificationRouter = Router();

announcementRouter.use(authenticate);
announcementRouter.get("/", listAnnouncements);
announcementRouter.post("/", createAnnouncement);
announcementRouter.patch("/:id", updateAnnouncement);
announcementRouter.delete("/:id", deleteAnnouncement);

notificationRouter.use(authenticate);
notificationRouter.get("/", listNotifications);
notificationRouter.patch("/:id/read", markRead);
notificationRouter.post("/read-all", markAllRead);

export { announcementRouter, notificationRouter };
