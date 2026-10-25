import { defineModel } from "./firestoreModel.js";

const Organization = defineModel("organizations", {
  documentId: "singleton",
  defaults: {
    companyName: "My Company", officeStart: "09:00", officeEnd: "17:00", graceMinutes: 15,
    halfDayHours: 6, weekendDays: [0, 6], currency: "PKR", hraPct: 40, medicalPct: 10,
    geofence: { enabled: false, lat: null, lng: null, radiusMeters: 500 },
    latePolicy: { deductionPerLatePct: 1.6, latesEqualToAbsent: 3 }, taxSlabs: [],
  },
});
export default Organization;
