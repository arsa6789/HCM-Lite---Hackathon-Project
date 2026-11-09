import { defineModel } from "./recordModel.js";

const AiLog = defineModel("aiLogs", { defaults: { role: null, tools: [], ok: true } });
export default AiLog;
