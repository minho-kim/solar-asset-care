import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SolarScope | 태양광 자산진단 운영센터',
  description:
    '검사 접수부터 열화상 원본, 전문가 판정, 보고서와 유지보수까지 연결하는 태양광 자산진단 운영센터',
  openGraph: {
    title: 'SolarScope | 태양광 자산진단 운영센터',
    description:
      '열화상 검사부터 전문가 판정, 보고서와 유지보수를 연결하는 실제 운영 플랫폼',
    images: [
      {
        url: '/solarscope-social-preview.png',
        width: 1200,
        height: 630,
        alt: 'SolarScope 태양광 자산진단 플랫폼',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
