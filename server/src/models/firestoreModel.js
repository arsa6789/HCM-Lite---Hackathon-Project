import { FieldPath } from "firebase-admin/firestore";
import { getFirestoreDb } from "../config/firestore.js";

const DEFAULTS = { timestamps: true, unique: [] };

function fromFirestore(value) {
  if (value?.toDate && typeof value.toDate === "function") return value.toDate();
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fromFirestore(item)]));
  }
  return value;
}

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
      if (operator === "$gte") return actual >= value;
      if (operator === "$gt") return actual > value;
      if (operator === "$lte") return actual <= value;
      if (operator === "$lt") return actual < value;
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

function queryable(value) {
  if (value instanceof RegExp) return false;
  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    return Object.keys(value).every((key) => ["$in", "$ne", "$gte", "$gt", "$lte", "$lt"].includes(key));
  }
  return true;
}

function applyWhere(query, filter) {
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("$")) continue;
    if (!queryable(value)) return null;
    const field = key === "_id" ? FieldPath.documentId() : key;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      for (const [operator, operand] of Object.entries(value)) {
        const firestoreOperator = { $in: "in", $ne: "!=", $gte: ">=", $gt: ">", $lte: "<=", $lt: "<" }[operator];
        if (!firestoreOperator) return null;
        if (operator === "$in" && operand.length > 30) return null;
        query = query.where(field, firestoreOperator, operand);
      }
    } else {
      query = query.where(field, "==", value);
    }
  }
  return query;
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
  if (value instanceof FirestoreDocument) return value.toObject();
  if (Array.isArray(value)) return value.map(asPlain);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asPlain(item)]));
  return value;
}

export class FirestoreDocument {
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
    const db = getFirestoreDb();
    const now = new Date();
    const data = removeUndefined(this.toObject());
    delete data._id;
    if (this._model.modelOptions.timestamps) {
      data.createdAt ??= now;
      data.updatedAt = now;
      this.createdAt = data.createdAt;
      this.updatedAt = data.updatedAt;
    }
    await db.collection(this._model.collectionName).doc(this._id).set(data);
    return this;
  }

  async deleteOne() {
    await getFirestoreDb().collection(this._model.collectionName).doc(this._id).delete();
    return { deletedCount: 1 };
  }
}

class FirestoreQuery {
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
    const db = getFirestoreDb();
    let records;
    if (this.id != null) {
      const snapshot = await db.collection(this.model.collectionName).doc(String(this.id)).get();
      records = snapshot.exists ? [{ ...fromFirestore(snapshot.data()), _id: snapshot.id }] : [];
    } else {
      const base = db.collection(this.model.collectionName);
      let snapshots = [];
      const branches = this.filter.$or;
      const rangeField = Object.keys(this.filter).find((key) => {
        const value = this.filter[key];
        return value && typeof value === "object" && ["$gte", "$gt", "$lte", "$lt"].some((operator) => operator in value);
      });
      const canUseServerSort = !this.sortSpec || !rangeField || Object.keys(this.sortSpec)[0] === rangeField;
      let canPaginateOnServer = false;
      if (branches && Object.keys(this.filter).length === 1) {
        const results = await Promise.all(branches.map(async (branch) => {
          const query = applyWhere(base, branch);
          const result = await (query ?? base).get();
          return result.docs;
        }));
        snapshots = [...new Map(results.flat().map((snapshot) => [snapshot.id, snapshot])).values()];
      } else {
        let query = applyWhere(base, this.filter);
        if (query && canUseServerSort) {
          if (this.sortSpec) {
            for (const [field, direction] of Object.entries(this.sortSpec)) query = query.orderBy(field, direction < 0 ? "desc" : "asc");
          }
          if (this.offset) query = query.offset(this.offset);
          if (this.max != null) query = query.limit(this.max);
          canPaginateOnServer = true;
        }
        const result = await (query ?? base).get();
        snapshots = result.docs;
      }
      records = snapshots.map((snapshot) => ({ ...fromFirestore(snapshot.data()), _id: snapshot.id }));
      records = records.filter((record) => matches(record, this.filter));
      if (canPaginateOnServer) this.offset = 0;
    }

    if (this.sortSpec) {
      const sortEntries = Object.entries(this.sortSpec);
      records.sort((left, right) => {
        for (const [field, direction] of sortEntries) {
          const a = getPath(left, field);
          const b = getPath(right, field);
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
      : records.map((record) => new FirestoreDocument(this.model, record._id, record));
    return this.single ? result[0] ?? null : result;
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
}

export function defineModel(collectionName, { defaults = {}, unique = [], references = {}, timestamps = true, documentId = null } = {}) {
  class Model extends FirestoreDocument {
    constructor(data = {}) {
      super(Model, data._id ?? documentId ?? getFirestoreDb().collection(collectionName).doc().id, { ...clone(defaults), ...data });
    }

    static collectionName = collectionName;
    static modelOptions = { ...DEFAULTS, timestamps, unique, documentId };
    static references = references;

    static find(filter = {}) { return new FirestoreQuery(Model, filter); }
    static findOne(filter = {}) { const query = new FirestoreQuery(Model, filter).limit(1); query.single = true; return query; }
    static findById(id) { const query = new FirestoreQuery(Model, {}, id); query.single = true; return query; }
    static async findByIds(ids, selection = "") {
      const references = ids.map((id) => getFirestoreDb().collection(collectionName).doc(String(id)));
      if (!references.length) return [];
      const snapshots = await getFirestoreDb().getAll(...references);
      return snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => {
        const record = { ...fromFirestore(snapshot.data()), _id: snapshot.id };
        return project(record, selection, Model);
      });
    }
    static async exists(filter = {}) { return (await new FirestoreQuery(Model, filter).limit(1)).length > 0; }
    static async countDocuments(filter = {}) {
      const query = applyWhere(getFirestoreDb().collection(collectionName), filter);
      if (query && !filter.$or && !filter.$and) {
        const result = await query.count().get();
        return result.data().count;
      }
      return (await new FirestoreQuery(Model, filter)).length;
    }

    static async create(data) {
      const doc = new Model(data);
      const db = getFirestoreDb();
      const ref = db.collection(collectionName).doc(doc._id);
      const now = new Date();
      const values = removeUndefined(doc.toObject());
      delete values._id;
      if (timestamps) {
        values.createdAt ??= now;
        values.updatedAt = now;
      }
      if (unique.length === 0) {
        await ref.create(values);
      } else await db.runTransaction(async (transaction) => {
        for (const uniqueKey of unique) {
          const fields = Array.isArray(uniqueKey) ? uniqueKey : [uniqueKey];
          if (fields.some((field) => values[field] == null || values[field] === "")) continue;
          let matchesQuery = db.collection(collectionName);
          for (const field of fields) matchesQuery = matchesQuery.where(field, "==", values[field]);
          matchesQuery = matchesQuery.limit(1);
          const existing = await transaction.get(matchesQuery);
          if (!existing.empty) {
            const error = new Error(`Duplicate unique value for ${fields.join(" and ")}.`);
            error.code = 6;
            throw error;
          }
        }
        transaction.create(ref, values);
      });
      Object.assign(doc, values);
      return doc;
    }

    static async deleteOne(filter = {}) {
      const document = await new FirestoreQuery(Model, filter).limit(1);
      if (!document.length) return { deletedCount: 0 };
      await document[0].deleteOne();
      return { deletedCount: 1 };
    }

    static async updateOne(filter, update, options = {}) {
      const document = await new FirestoreQuery(Model, filter).limit(1);
      if (!document.length && !options.upsert) return { matchedCount: 0, modifiedCount: 0 };
      if (!document.length) {
        const data = { ...filter, ...(update.$set ?? update) };
        await Model.create(data);
        return { matchedCount: 0, modifiedCount: 1, upsertedCount: 1 };
      }
      Object.assign(document[0], update.$set ?? update);
      await document[0].save();
      return { matchedCount: 1, modifiedCount: 1 };
    }

    static async updateMany(filter, update) {
      const documents = await new FirestoreQuery(Model, filter);
      const db = getFirestoreDb();
      for (let offset = 0; offset < documents.length; offset += 450) {
        const batch = db.batch();
        for (const document of documents.slice(offset, offset + 450)) {
          const data = removeUndefined({ ...document.toObject(), ...(update.$set ?? update), updatedAt: new Date() });
          delete data._id;
          batch.set(db.collection(collectionName).doc(document._id), data);
        }
        await batch.commit();
      }
      return { matchedCount: documents.length, modifiedCount: documents.length };
    }

    static async insertMany(items) {
      const db = getFirestoreDb();
      const now = new Date();
      const documents = items.map((item) => new Model(item));
      for (let offset = 0; offset < documents.length; offset += 450) {
        const batch = db.batch();
        for (const document of documents.slice(offset, offset + 450)) {
          const values = removeUndefined(document.toObject());
          delete values._id;
          if (timestamps) {
            values.createdAt ??= now;
            values.updatedAt = now;
          }
          batch.create(db.collection(collectionName).doc(document._id), values);
          Object.assign(document, values);
        }
        await batch.commit();
      }
      return documents;
    }

    static async aggregate(pipeline = []) {
      let records = [];
      let loaded = false;
      for (const stage of pipeline) {
        if (stage.$match) {
          records = await new FirestoreQuery(Model, stage.$match).lean();
          loaded = true;
        }
        if (stage.$group) {
          if (!loaded) {
            records = await new FirestoreQuery(Model, {}).lean();
            loaded = true;
          }
          const groups = new Map();
          for (const record of records) {
            const idExpression = stage.$group._id;
            const groupId = typeof idExpression === "string" && idExpression.startsWith("$")
              ? getPath(record, idExpression.slice(1))
              : idExpression;
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
      return loaded ? records : new FirestoreQuery(Model, {}).lean();
    }
  }
  return Model;
}
