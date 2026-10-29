import type { Metadata, Viewport } from "next";
import "./globals.css";
import { currentTheme } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "딜러매칭", description: "홀덤펍 딜러매칭 매칭" };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await currentTheme();
  return (
    <html lang="ko" data-theme={theme}>
      <head>
        {/* Pretendard (숨고와 같은 서체). 가변 폰트 동적 서브셋 */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
