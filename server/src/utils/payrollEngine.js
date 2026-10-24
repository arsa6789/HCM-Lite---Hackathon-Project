export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function computeGross({ basic, allowance = 0, hraPct, medicalPct }) {
  const base = Number(basic ?? 0);
  const extra = Number(allowance ?? 0);
  const hra = round2((base * Number(hraPct ?? 0)) / 100);
  const medical = round2((base * Number(medicalPct ?? 0)) / 100);

  return { hra, medical, gross: round2(base + extra + hra + medical) };
}

export function computeProgressiveTax(amount, slabs) {
  const ordered = [...(slabs ?? [])]
    .filter((slab) => slab && Number.isFinite(Number(slab.ratePct)))
    .sort((a, b) => {
      if (a.upTo == null) {
        return 1;
      }

      if (b.upTo == null) {
        return -1;
      }

      return a.upTo - b.upTo;
    });

  let remaining = Math.max(0, Number(amount ?? 0));
  let lowerBound = 0;
  let tax = 0;

  for (const slab of ordered) {
    const upperBound = slab.upTo == null ? Infinity : Number(slab.upTo);
    const span = Math.min(remaining, upperBound - lowerBound);

    if (span > 0) {
      tax += (span * Number(slab.ratePct)) / 100;
      remaining -= span;
    }

    lowerBound = upperBound;

    if (remaining <= 0) {
      break;
    }
  }

  return round2(tax);
}

export function countPayrollAttendance(records, workingDayKeys) {
  const recordsByDate = new Map(records.map((record) => [record.date, record]));
  const attendance = {
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    absentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
  };

  for (const date of workingDayKeys) {
    const status = recordsByDate.get(date)?.status;

    if (status === "present") attendance.presentDays += 1;
    else if (status === "late") attendance.lateDays += 1;
    else if (status === "half_day") attendance.halfDays += 1;
    else if (status === "absent" || !status) attendance.absentDays += 1;
  }

  return attendance;
}

export function computePayrollLine({
  basic,
  allowance = 0,
  hraPct,
  medicalPct,
  workingDays,
  attendance = {},
  latePolicy = {},
  taxSlabs = [],
}) {
  const { hra, medical, gross } = computeGross({ basic, allowance, hraPct, medicalPct });
  const presentDays = Number(attendance.presentDays ?? 0);
  const lateDays = Number(attendance.lateDays ?? 0);
  const halfDays = Number(attendance.halfDays ?? 0);
  const absentDays = Number(attendance.absentDays ?? 0);
  const unpaidLeaveDays = Number(attendance.unpaidLeaveDays ?? 0);
  const perDay = workingDays > 0 ? gross / workingDays : 0;

  const absentDeduction = round2(absentDays * perDay);
  const halfDayDeduction = round2(0.5 * perDay * halfDays);
  const unpaidLeaveDeduction = round2(unpaidLeaveDays * perDay);
  const lateDeduction = round2((gross * Number(latePolicy.deductionPerLatePct ?? 0) * lateDays) / 100);
  const extraUnpaidDeduction = lateDays > Number(latePolicy.latesEqualToAbsent ?? 0) ? round2(perDay) : 0;
  const totalDeductions = round2(
    absentDeduction + halfDayDeduction + unpaidLeaveDeduction + lateDeduction + extraUnpaidDeduction
  );
  const taxable = Math.max(0, round2(gross - totalDeductions));
  const tax = computeProgressiveTax(taxable, taxSlabs);
  const net = round2(taxable - tax);

  return {
    basic: round2(basic ?? 0),
    allowance: round2(allowance ?? 0),
    hra,
    medical,
    gross,
    perDay: round2(perDay),
    absentDeduction,
    halfDayDeduction,
    unpaidLeaveDeduction,
    lateDeduction,
    extraUnpaidDeduction,
    totalDeductions,
    taxable,
    tax,
    net,
  };
}
