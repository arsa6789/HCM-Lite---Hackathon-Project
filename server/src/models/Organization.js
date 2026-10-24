import mongoose from "mongoose";

const taxSlabSchema = new mongoose.Schema({
  upTo: { type: Number, default: null, min: 0 },
  ratePct: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

const orgSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true, maxlength: 120 },
  officeStart: { type: String, default: "09:00" },
  officeEnd: { type: String, default: "17:00" },
  graceMinutes: { type: Number, default: 15, min: 0, max: 240 },
  halfDayHours: { type: Number, default: 6, min: 1, max: 12 },
  weekendDays: { type: [Number], default: [0, 6] },
  currency: { type: String, default: "PKR", maxlength: 8 },
  hraPct: { type: Number, default: 40, min: 0, max: 200 },
  medicalPct: { type: Number, default: 10, min: 0, max: 200 },
  geofence: {
    enabled: { type: Boolean, default: false },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    radiusMeters: { type: Number, default: 500, min: 50, max: 5000 },
  },
  latePolicy: {
    deductionPerLatePct: { type: Number, default: 1.6, min: 0, max: 100 },
    latesEqualToAbsent: { type: Number, default: 3, min: 1, max: 31 },
  },
  taxSlabs: { type: [taxSlabSchema], default: [] },
}, { timestamps: true, versionKey: false });

export default mongoose.models.Organization || mongoose.model("Organization", orgSchema);
