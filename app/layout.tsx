import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIOMMO Studio",
  description: "Bộ công cụ tạo nội dung AI chạy ngay trên trình duyệt của bạn — All In One MMO",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AIOMMO Studio"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#091e1e"
};

// Optional: Microsoft Clarity (free session recordings + heatmaps) on top of the
// built-in analytics at /thong-ke. Off unless NEXT_PUBLIC_CLARITY_ID is set.
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID?.replace(/[^a-z0-9]/gi, "");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (dark by default) to avoid a light flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("aio-theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){}`,
          }}
        />
        {CLARITY_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${CLARITY_ID}");`,
            }}
          />
        )}
      </head>
      <body>
        <div id="site-content" className="site-content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
