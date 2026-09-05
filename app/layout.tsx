import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
    title: "VORLDA · Creative Workshop",
    description: "One workshop for applications, images, films and characters. Build with connected parts and a transparent dollar wallet.",
    icons: {
        icon: "/favicon.svg",
        shortcut: "/favicon.svg",
    },
};
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="ar">
      <body className="antialiased">{children}</body>
    </html>);
}
