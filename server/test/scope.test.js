import test from "node:test";
import assert from "node:assert/strict";
import { canAccessRecord, resolveScope, scopeFilter } from "../src/access/scope.js";
import { assertFieldsAllowed, serializeUser } from "../src/access/policies.js";

const admin = { id: "1", role: "admin" };
const hr = { id: "2", role: "hr" };
const employee = { id: "3", role: "employee" };

const employeeRecord = { _id: "10", email: "employee@hcm.local", role: "employee" };
const adminRecord = { _id: "11", email: "admin@hcm.local", role: "admin" };
const hrRecord = { _id: "12", email: "hr@hcm.local", role: "hr" };

test("admin scope covers every record", () => {
  assert.equal(resolveScope(admin).type, "all");
  assert.deepEqual(scopeFilter(admin), {});
  assert.equal(canAccessRecord(admin, employeeRecord), true);
  assert.equal(canAccessRecord(admin, adminRecord), true);
});

test("hr scope covers employee accounts and its own account", () => {
  assert.equal(resolveScope(hr).type, "employees");
  assert.deepEqual(scopeFilter(hr), { role: "employee" });
  assert.equal(canAccessRecord(hr, employeeRecord), true);
  assert.equal(canAccessRecord(hr, { _id: "2", role: "hr" }), true);
  assert.equal(canAccessRecord(hr, adminRecord), false);
  assert.equal(canAccessRecord(hr, hrRecord), false);
});

test("employee scope is limited to its own record", () => {
  assert.equal(resolveScope(employee).type, "self");
  assert.deepEqual(scopeFilter(employee), { _id: "3" });
  assert.equal(canAccessRecord(employee, { _id: "3", role: "employee" }), true);
  assert.equal(canAccessRecord(employee, employeeRecord), false);
});

test("serialized users expose only id, email and role", () => {
  const data = serializeUser({ _id: "10", email: "a@b.co", role: "employee", password: "hash" });
  assert.deepEqual(Object.keys(data).sort(), ["email", "id", "role"]);
  assert.equal(data.id, "10");
});

test("disallowed fields are rejected", () => {
  assert.throws(() => assertFieldsAllowed({ role: "admin" }, ["email"]), /cannot set these fields/i);
  assert.throws(() => assertFieldsAllowed({ password: "secret12" }, ["email"]), /cannot set these fields/i);
  assert.doesNotThrow(() => assertFieldsAllowed({ email: "a@b.co" }, ["email"]));
});
