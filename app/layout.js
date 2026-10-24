import "./globals.css";

export const metadata = {
  title: "HCM lite | Human capital, made clear",
  description: "A considered workspace for people operations, attendance, leave and payroll.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f8f5",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
