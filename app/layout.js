import "./globals.css";

export const metadata = {
  title: "HCM lite",
  description:
    "AI-assisted Human Capital Management",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e1b4b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
