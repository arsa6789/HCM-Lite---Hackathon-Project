import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE_COLOR = rgb(0.85, 0.87, 0.9);
const ACCENT = rgb(0.31, 0.27, 0.9);
const ACCENT_SOFT = rgb(0.93, 0.93, 1);

const PAGE_WIDTH = 595.28;
const MARGIN = 50;

// Standard fonts only support WinAnsi; strip anything outside that range.
function pdfSafe(value) {
  return String(value ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function money(value, currency) {
  return `${Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export async function buildPayslipPdf({ org, run, line, employee }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const currency = line.currency ?? org?.currency ?? "PKR";

  const draw = (text, { x, y, size = 10, font = regular, color = INK }) => {
    page.drawText(pdfSafe(text), { x, y, size, font, color });
  };

  const right = (text, { y, size = 10, font = regular, color = INK }) => {
    const width = font.widthOfTextAtSize(pdfSafe(text), size);
    page.drawText(pdfSafe(text), { x: PAGE_WIDTH - MARGIN - width, y, size, font, color });
  };

  const divider = (y) => {
    page.drawRectangle({ x: MARGIN, y, width: PAGE_WIDTH - MARGIN * 2, height: 0.75, color: LINE_COLOR });
  };

  draw(org?.companyName ?? "HCM Lite", { x: MARGIN, y: 780, size: 18, font: bold });
  draw("Payslip", { x: MARGIN, y: 764, size: 10, color: MUTED });
  right(run.month, { y: 780, size: 14, font: bold });
  right(`Generated ${new Date().toISOString().slice(0, 10)}`, { y: 764, size: 9, color: MUTED });
  divider(750);

  draw("Employee", { x: MARGIN, y: 722, size: 11, font: bold });
  const employeeLines = [
    employee.fullName || employee.email,
    employee.email,
    employee.employeeCode ? `Code ${employee.employeeCode}` : null,
    employee.departmentName ? `Department ${employee.departmentName}` : null,
  ].filter(Boolean);

  employeeLines.forEach((text, index) => {
    draw(text, { x: MARGIN, y: 704 - index * 14, size: 10, color: index === 0 ? INK : MUTED });
  });

  right(`Status: ${run.status}`, { y: 722, size: 10, color: MUTED });
  right(`Working days: ${run.workingDays}`, { y: 704, size: 10, color: MUTED });

  let y = 600;
  divider(y + 24);
  draw("Earnings", { x: MARGIN, y, size: 11, font: bold });
  y -= 20;

  const earnings = [
    ["Basic", line.basic],
    ["Allowance", line.allowance],
    ["HRA", line.hra],
    ["Medical", line.medical],
  ];

  for (const [label, value] of earnings) {
    draw(label, { x: MARGIN, y, size: 10 });
    right(money(value, currency), { y, size: 10 });
    y -= 16;
  }

  draw("Gross", { x: MARGIN, y, size: 10, font: bold });
  right(money(line.gross, currency), { y, size: 10, font: bold });
  y -= 30;

  divider(y + 24);
  draw("Deductions", { x: MARGIN, y, size: 11, font: bold });
  y -= 20;

  const deductions = [
    ["Absent", line.absentDeduction],
    ["Half-day", line.halfDayDeduction],
    ["Unpaid leave", line.unpaidLeaveDeduction],
    ["Late", line.lateDeduction],
    ["Extra unpaid day (lates)", line.extraUnpaidDeduction],
    ["Income tax", line.tax],
  ];

  for (const [label, value] of deductions) {
    draw(label, { x: MARGIN, y, size: 10 });
    right(money(value, currency), { y, size: 10 });
    y -= 16;
  }

  draw("Total deductions", { x: MARGIN, y, size: 10, font: bold });
  right(money(line.totalDeductions, currency), { y, size: 10, font: bold });
  y -= 40;

  const boxHeight = 46;
  page.drawRectangle({
    x: MARGIN,
    y: y - 12,
    width: PAGE_WIDTH - MARGIN * 2,
    height: boxHeight,
    color: ACCENT_SOFT,
  });

  draw("Net pay", { x: MARGIN + 14, y: y + 6, size: 13, font: bold, color: ACCENT });
  right(money(line.net, currency), { y: y + 4, size: 14, font: bold, color: ACCENT });

  y -= 30;
  draw(
    "Computer-generated payslip. Attendance deductions and tax follow company policy.",
    { x: MARGIN, y, size: 8, color: MUTED }
  );

  return Buffer.from(await doc.save());
}
