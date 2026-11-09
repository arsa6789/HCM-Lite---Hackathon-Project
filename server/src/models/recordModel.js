import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../config/supabase.js";

const DEFAULTS = { timestamps: true, unique: [] };
const TABLE = "hcm_records";

function clone(value) {
  return structuredClone(value);
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, removeUndefined(item)]));
  }
  return value;
}

function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item)]));
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return new Date(value);
  return value;
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function matchesValue(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual ?? ""));
  if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
    return Object.entries(expected).every(([operator, value]) => {
      if (operator === "$in") return value.some((item) => String(actual) === String(item));
      if (operator === "$nin") return !value.some((item) => String(actual) === String(item));
      if (operator === "$ne") return String(actual) !== String(value);
      if (operator === "$gte") return new Date(actual).getTime() >= new Date(value).getTime();
      if (operator === "$gt") return new Date(actual).getTime() > new Date(value).getTime();
      if (operator === "$lte") return new Date(actual).getTime() <= new Date(value).getTime();
      if (operator === "$lt") return new Date(actual).getTime() < new Date(value).getTime();
      if (operator === "$regex") return new RegExp(value, expected.$options ?? "").test(String(actual ?? ""));
      return false;
    });
  }
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
  return String(actual ?? "") === String(expected ?? "");
}

function matches(record, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((branch) => matches(record, branch));
    if (key === "$and") return expected.every((branch) => matches(record, branch));
    const actual = key === "_id" ? record._id : getPath(record, key);
    return matchesValue(actual, expected);
  });
}

function project(record, selection, model) {
  if (!selection) {
    const output = { ...record };
    if (model.collectionName === "users") delete output.password;
    return output;
  }
  const fields = selection.split(/\s+/).filter(Boolean);
  const include = fields.filter((field) => !field.startsWith("-") && !field.startsWith("+"));
  const exclude = fields.filter((field) => field.startsWith("-")).map((field) => field.slice(1));
  const passwordExplicit = fields.includes("+password");
  let output = record;
  if (include.length) {
    output = { _id: record._id };
    for (const field of include) {
      const value = getPath(record, field);
      if (value !== undefined) output[field] = value;
    }
  }
  if (model.collectionName === "users" && !passwordExplicit && !include.includes("password")) delete output.password;
  for (const field of exclude) delete output[field];
  return output;
}

function asPlain(value) {
  if (value instanceof SupabaseDocument) return value.toObject();
  if (Array.isArray(value)) return value.map(asPlain);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asPlain(item)]));
  return value;
}

function checkError(error) {
  if (!error) return;
  if (error.code === "23505") {
    const duplicate = new Error("A record with this unique value already exists.");
    duplicate.code = "23505";
    throw duplicate;
  }
  const failure = new Error(error.message || "Supabase database request failed.");
  failure.code = error.code;
  failure.details = error.details;
  throw failure;
}

async function getRows(collection, id = null) {
  const rows = [];
  let start = 0;
  while (true) {
    let query = getSupabaseAdmin().from(TABLE).select("id,data").eq("collection", collection).order("id").range(start, start + 999);
    if (id != null) query = query.eq("id", String(id));
    const { data, error } = await query;
    checkError(error);
    rows.push(...(data ?? []));
    if (id != null || (data ?? []).length < 1000) break;
    start += 1000;
  }
  return rows.map((row) => ({ ...revive(row.data ?? {}), _id: row.id }));
}

async function writeRow(collection, id, record, { insertOnly = false } = {}) {
  const data = removeUndefined({ ...record });
  delete data._id;
  const client = getSupabaseAdmin();
  const query = insertOnly
    ? client.from(TABLE).insert({ collection, id: String(id), data })
    : client.from(TABLE).upsert({ collection, id: String(id), data }, { onConflict: "collection,id" });
  const { error } = await query;
  checkError(error);
  return data;
}

export class SupabaseDocument {
  constructor(model, id, data = {}) {
    this._model = model;
    this._id = id;
    Object.assign(this, clone(data));
  }
  toObject() {
    const output = {};
    for (const [key, value] of Object.entries(this)) {
      if (key !== "_model" && key !== "_id") output[key] = clone(value);
    }
    output._id = this._id;
    return output;
  }
  async save() {
    const now = new Date();
    const data = this.toObject();
    delete data._id;
    if (this._model.modelOptions.timestamps) {
      data.createdAt ??= now;
      data.updatedAt = now;
      this.createdAt = data.createdAt;
      this.updatedAt = data.updatedAt;
    }
    await writeRow(this._model.collectionName, this._id, data);
    return this;
  }
  async deleteOne() {
    const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("collection", this._model.collectionName).eq("id", String(this._id));
    checkError(error);
    return { deletedCount: 1 };
  }
}

class SupabaseQuery {
  constructor(model, filter = {}, id = null) {
    this.model = model;
    this.filter = filter ?? {};
    this.id = id;
    this.selection = null;
    this.sortSpec = null;
    this.offset = 0;
    this.max = null;
    this.populations = [];
    this.plain = false;
    this.single = false;
  }
  select(selection) { this.selection = selection; return this; }
  sort(spec) { this.sortSpec = spec; return this; }
  skip(value) { this.offset = Math.max(0, Number(value) || 0); return this; }
  limit(value) { this.max = Math.max(0, Number(value) || 0); return this; }
  populate(path, selection = "") { this.populations.push({ path, selection }); return this; }
  lean() { this.plain = true; return this; }
  async distinct(field) {
    const records = await this.execute();
    return [...new Set(records.map((record) => getPath(asPlain(record), field)).filter((value) => value != null))];
  }
  async execute() {
    let records = await getRows(this.model.collectionName, this.id);
    records = records.filter((record) => matches(record, this.filter));
    if (this.sortSpec) {
      const sortEntries = Object.entries(this.sortSpec);
      records.sort((left, right) => {
        for (const [field, direction] of sortEntries) {
          const a = getPath(left, field);
          const b = getPath(right, field);
          if (a == null && b != null) return direction < 0 ? 1 : -1;
          if (a != null && b == null) return direction < 0 ? -1 : 1;
          if (a < b) return -1 * direction;
          if (a > b) return 1 * direction;
        }
        return 0;
      });
    }
    if (this.offset) records = records.slice(this.offset);
    if (this.max != null) records = records.slice(0, this.max);
    for (const { path, selection } of this.populations) {
      const target = this.model.references?.[path];
      if (!target) continue;
      const ids = [...new Set(records.map((record) => record[path]).filter(Boolean).map(String))];
      const relatedRecords = await target.findByIds(ids, selection);
      const relatedById = new Map(relatedRecords.map((record) => [record._id, record]));
      records = records.map((record) => ({ ...record, [path]: relatedById.get(String(record[path])) ?? null }));
    }
    records = records.map((record) => project(record, this.selection, this.model));
    const result = this.plain
      ? records.map(asPlain)
      : records.map((record) => new SupabaseDocument(this.model, record._id, record));
    return this.single ? result[0] ?? null : result;
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
}

export function defineModel(collectionName, { defaults = {}, unique = [], references = {}, timestamps = true, documentId = null } = {}) {
  class Model extends SupabaseDocument {
    constructor(data = {}) {
      super(Model, data._id ?? documentId ?? randomUUID(), { ...clone(defaults), ...data });
    }
    static collectionName = collectionName;
    static modelOptions = { ...DEFAULTS, timestamps, unique, documentId };
    static references = references;
    static find(filter = {}) { return new SupabaseQuery(Model, filter); }
    static findOne(filter = {}) { const query = new SupabaseQuery(Model, filter).limit(1); query.single = true; return query; }
    static findById(id) { const query = new SupabaseQuery(Model, {}, id); query.single = true; return query; }
    static async findByIds(ids, selection = "") {
      if (!ids.length) return [];
      const wanted = new Set(ids.map(String));
      return (await getRows(collectionName)).filter((record) => wanted.has(String(record._id))).map((record) => project(record, selection, Model));
    }
    static async exists(filter = {}) { return (await new SupabaseQuery(Model, filter).limit(1)).length > 0; }
    static async countDocuments(filter = {}) { return (await new SupabaseQuery(Model, filter)).length; }
    static async create(data) {
      const doc = new Model(data);
      const now = new Date();
      const values = removeUndefined(doc.toObject());
      delete values._id;
      if (timestamps) {
        values.createdAt ??= now;
        values.updatedAt = now;
      }
      await writeRow(collectionName, doc._id, values, { insertOnly: true });
      Object.assign(doc, values);
      return doc;
    }
    static async deleteOne(filter = {}) {
      const document = await new SupabaseQuery(Model, filter).limit(1);
      if (!document.length) return { deletedCount: 0 };
      await document[0].deleteOne();
      return { deletedCount: 1 };
    }
    static async updateOne(filter, update, options = {}) {
      const document = await new SupabaseQuery(Model, filter).limit(1);
      if (!document.length && !options.upsert) return { matchedCount: 0, modifiedCount: 0 };
      if (!document.length) {
        await Model.create({ ...filter, ...(update.$set ?? update) });
        return { matchedCount: 0, modifiedCount: 1, upsertedCount: 1 };
      }
      Object.assign(document[0], update.$set ?? update);
      await document[0].save();
      return { matchedCount: 1, modifiedCount: 1 };
    }
    static async updateMany(filter, update) {
      const documents = await new SupabaseQuery(Model, filter);
      for (const document of documents) {
        Object.assign(document, update.$set ?? update);
        await document.save();
      }
      return { matchedCount: documents.length, modifiedCount: documents.length };
    }
    static async insertMany(items) {
      const now = new Date();
      const documents = items.map((item) => new Model(item));
      for (const document of documents) {
        const values = removeUndefined(document.toObject());
        delete values._id;
        if (timestamps) {
          values.createdAt ??= now;
          values.updatedAt = now;
        }
        await writeRow(collectionName, document._id, values, { insertOnly: true });
        Object.assign(document, values);
      }
      return documents;
    }
    static async aggregate(pipeline = []) {
      let records = [];
      let loaded = false;
      for (const stage of pipeline) {
        if (stage.$match) {
          records = await new SupabaseQuery(Model, stage.$match).lean();
          loaded = true;
        }
        if (stage.$group) {
          if (!loaded) {
            records = await new SupabaseQuery(Model, {}).lean();
            loaded = true;
          }
          const groups = new Map();
          for (const record of records) {
            const idExpression = stage.$group._id;
            const groupId = typeof idExpression === "string" && idExpression.startsWith("$") ? getPath(record, idExpression.slice(1)) : idExpression;
            const key = JSON.stringify(groupId ?? null);
            if (!groups.has(key)) groups.set(key, { _id: groupId ?? null });
            const group = groups.get(key);
            for (const [field, expression] of Object.entries(stage.$group)) {
              if (field === "_id") continue;
              if (expression?.$sum === 1) group[field] = (group[field] ?? 0) + 1;
              else if (typeof expression?.$sum === "string" && expression.$sum.startsWith("$")) group[field] = (group[field] ?? 0) + Number(getPath(record, expression.$sum.slice(1)) ?? 0);
              else if (expression?.$sum?.$add) group[field] = (group[field] ?? 0) + expression.$sum.$add.reduce((sum, term) => sum + Number(typeof term === "string" && term.startsWith("$") ? getPath(record, term.slice(1)) ?? 0 : term), 0);
            }
          }
          records = [...groups.values()];
        }
      }
      return loaded ? records : new SupabaseQuery(Model, {}).lean();
    }
  }
  return Model;
}
