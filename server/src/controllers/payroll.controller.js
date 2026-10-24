import { asyncHandler } from "../utils/asyncHandler.js";
import { assertObjectId } from "../utils/validate.js";
import { summary } from "../services/dashboardService.js";
import {
  createRun,
  listRuns,
  getRun,
  finalizeRun,
  deleteRun,
  payslipsFor,
  payslipPdf,
} from "../services/payrollService.js";
import { audit } from "../utils/audit.js";

export const postRun = asyncHandler(async (req, res) => {
  const run = await createRun(req.user, req.body?.month);
  await audit(req.user, "payroll.create", "payroll_run", String(run._id), { month: run.month }, req);
  res.status(201).json({ run: { id: String(run._id), month: run.month, status: run.status } });
});

export const getRuns = asyncHandler(async (req, res) => {
  res.json({ runs: await listRuns(req.user) });
});

export const getRunById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "run id");
  res.json({ run: await getRun(req.user, req.params.id) });
});

export const postFinalize = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "run id");
  const run = await finalizeRun(req.user, req.params.id);
  await audit(req.user, "payroll.finalize", "payroll_run", req.params.id, { month: run.month }, req);
  res.json({ run });
});

export const deleteRunById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "run id");
  const result = await deleteRun(req.user, req.params.id);
  await audit(req.user, "payroll.delete", "payroll_run", req.params.id, {}, req);
  res.json(result);
});

export const getMine = asyncHandler(async (req, res) => {
  res.json({ payslips: await payslipsFor(req.user, req.query.userId) });
});

export const getPayslipPdf = asyncHandler(async (req, res) => {
  const runId = req.params.runId ?? req.params.id;
  const pdf = await payslipPdf(req.user, runId, req.params.userId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="payslip-${runId}.pdf"`);
  res.send(pdf);
});
