# Thư viện Mẫu Video & Prompt AI (`/mau-video`)

Gộp từ template "AIOMMO Template AI" (file `web template.rar`) vào tool.allinonemmo.com theo yêu cầu: một domain, một app, dùng router thay vì tách subdomain.

- Trang: `/mau-video` (tất cả), `/mau-video/danh-muc/<video|image|content|audio|biz>`, `/mau-video/prompt/<id>`, `/mau-video/da-luu` (lưu trong trình duyệt). Sinh tĩnh lúc build.
- Dữ liệu: `data/prompts.ts` (prompt, biến `{{ten_bien}}` phải có giá trị mẫu trong `vars`, nhãn trong `VAR_LABELS`), `taxonomy.ts` (danh mục, nền tảng).
- Giao diện: dùng chung `AppShell` của tool (menu trên, theme, hạt nền, breadcrumb) qua `components/MauVideoShell.tsx`; CSS riêng `mau-video.css` với tiền tố `mv-`.
- Menu: danh mục `template` trong `lib/features.ts` (các mục `standalone: true` vì là trang riêng, không chạy trong PortalPage).
- Video xem trước: đặt `public/mau-video/previews/<id>.mp4` (hoặc .webm) và ảnh bìa `<id>.jpg|.webp|.png`; `media.ts` tự tìm theo id lúc build. Thêm file xong cần `npm run build` lại.
