import type { Metadata } from "next";
import "@/ui/styles/globals.css";
import "@/ui/styles/visual-theme.css";
export const metadata: Metadata = {
  title: "Аким на 5 часов — город начинается с решений",
  description:
    "Локальная городская лаборатория: пять решений, один бюджет и понятные последствия.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
