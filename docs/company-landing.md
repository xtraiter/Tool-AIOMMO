# Landing công ty All In One MMO

Landing được chuyển từ `D:/code/CMS_AIO/frontend` sang dự án Next.js này.

- Route: `/about` (`app/about/page.tsx`). Trang `/` và các công cụ nội dung hiện có được giữ nguyên.
- Giao diện, album, hiệu ứng cuộn: `features/company/`.
- Ảnh WebP: `public/cty/landing/`; logo: `public/company/logo.png`.
- Sáng/tối lưu trên trình duyệt bằng khóa `aio-theme`, độc lập với API hoặc đăng nhập CMS.
- Hiệu ứng tự hoạt động và tôn trọng `prefers-reduced-motion` của thiết bị.
- Landing chính dùng đường dẫn `/`; route `/about` được giữ làm địa chỉ tương thích.
- Hai nút đăng nhập dùng đường dẫn `/app` trong `features/company/companyLinks.ts`, mở giao diện ứng dụng trên cùng tên miền và cổng hiện tại.
- Bảng màu sáng be/navy được giữ từ CMS theo yêu cầu; màu tối từ `xanh3.xaml`. Token chỉ nằm trong `features/company/styles/company-theme.css`.

## Chạy và kiểm tra

```powershell
npm run dev
# Mở http://localhost:3000/about

npm run build
npm run start -- --port 3010
# Mở http://localhost:3010/about

npx tsc --noEmit --incremental false
npx eslint features/company app/about
```

## Tạo lại ảnh tối ưu

Ảnh JPG gốc của người dùng vẫn được giữ ở CMS; các bản WebP đã chuyển sang đây.
Script cần Python và Pillow, nhận đường dẫn thư mục JPG gốc:

```powershell
python scripts/prepare-company-photos.py D:/code/CMS_AIO/frontend/public/cty
```

CMS đã gỡ route `/about`, component landing và bản WebP trùng lặp. CMS vẫn mở `/login` khi truy cập `/`; trang tổng quan thành viên ở `/dashboard`.

Bản nguồn trước chuyển đổi được giữ ngoài frontend tại `D:/code/CMS_AIO/.artifacts/company-migration-original/`.
