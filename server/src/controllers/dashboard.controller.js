import { asyncHandler } from "../utils/asyncHandler.js";
import { summary } from "../services/dashboardService.js";

export const getSummary = asyncHandler(async (req, res) => {
  const dashboard = await summary(req.user, {
    from: req.query.from,
    to: req.query.to,
    departmentId: req.query.departmentId,
  });
  res.json({ dashboard });
});
