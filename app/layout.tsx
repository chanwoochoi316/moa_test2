import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"모아플랜 | 나만의 자산 설계도",description:"내 돈을 비상금·목표·장기 투자로 나누는 자산 설계도. 무료 진단부터 자산관리까지.",robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
