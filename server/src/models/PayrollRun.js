import { defineModel } from "./recordModel.js";

const PayrollRun = defineModel("payrollRuns", {
  defaults: { status: "draft", workingDays: 0, lines: [], summary: {}, preparedBy: null, finalizedBy: null },
  unique: ["month"],
});
export default PayrollRun;
