# Đồng bộ TutorialMMO

Nguồn giao diện và API: `https://github.com/xtraiter/TutorialMMO` (nhánh `main`).

## Kiến trúc triển khai

- Giao diện người dùng được build vào `public/tutorio` và hiển thị trong tính năng `Hướng dẫn sử dụng`.
- Laravel API chạy nội bộ tại `127.0.0.1:3011`; trình duyệt chỉ truy cập qua `/api/tutorial` của ứng dụng chính.
- Các thao tác thêm, sửa, xóa video phải vượt qua kiểm tra quyền Admin Supabase của ứng dụng chính.
- Tài khoản Laravel nội bộ được sinh ngẫu nhiên và không cung cấp cho trình duyệt.
- Video cũ và mới đều nằm dưới `/var/www/allinonemmo.com/media/tutorial-videos`.

## Đồng bộ lần sau

1. Clone/pull nhánh `main` của TutorialMMO.
2. Trong `company-web`, đặt `VITE_API_URL=/api/tutorial`, build với base `/tutorio/`, rồi chép `dist` vào `public/tutorio`.
3. Chạy `scripts/setup-tutorial-server.sh` trên server. Script chỉ fast-forward repo API, migrate database riêng, giữ nguyên symlink kho video và restart hai tiến trình PM2.
4. Build/restart ứng dụng chính bằng `deploy-server.ps1`.

Không chạy `DatabaseSeeder` của dự án nguồn trên production vì seeder đó tạo tài khoản mặc định `admin/admin`.
