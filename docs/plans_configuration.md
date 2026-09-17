# Cấu hình các Gói cước Dịch vụ (Plans & Packages Configuration)

Tài liệu này chi tiết cấu hình phân bổ tính năng và hạn mức cho các gói dịch vụ: **Free, Starter, Pro, VIP** của hệ thống **All in One MMO**.

---

## 1. Bảng phân bổ tính năng (Menu Access)

Dưới đây là chi tiết phân quyền menu hiển thị cho từng gói cước:

| Slug tính năng | Tên hiển thị | Gói FREE | Gói STARTER | Gói PRO | Gói VIP | Ghi chú |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `content.create` | Tạo nội dung | ✅ | ✅ | ✅ | ✅ | SEO Blog, v.v. |
| `content.rewrite` | Tạo lại nội dung | ✅ | ✅ | ✅ | ✅ | Viết lại đơn lẻ |
| `video.merge` | Ghép video âm nhạc | ❌ | ✅ | ✅ | ✅ | Ghép video & nhạc ở client |
| `settings.providers`| Cấu hình API | ❌ | ✅ | ✅ | ✅ | API Key cá nhân/hệ thống |
| `content.history` | Lịch sử nội dung | ❌ | ❌ | ✅ | ✅ | Xem lịch sử bài viết đã lưu |
| `content.story` | Sáng tác truyện | ❌ | ❌ | ✅ | ✅ | Sáng tác truyện/tiểu thuyết bằng AI |
| `content.bulk_rewrite`| Rewrite hàng loạt | ❌ | ❌ | ✅ | ✅ | Viết lại nhiều URLs cùng lúc |
| `admin.usage` | Online & usage | ❌ | ❌ | ❌ | ❌ | **Chỉ dành riêng cho Admin** |

---

## 2. Gợi ý hạn mức sử dụng (Usage Quota & Limits)

Để đảm bảo hiệu năng và cân bằng chi phí tài nguyên API, hạn mức cho các gói được đề xuất cấu hình ở Backend như sau:

### Gói FREE (Trải nghiệm thử)
* **Mục tiêu:** Cho khách đăng ký dùng thử để kiểm nghiệm chất lượng nội dung AI sinh ra.
* **Hạn mức đề xuất:**
  - Tối đa **2 lượt tạo / ngày** đối với `Tạo nội dung` và `Tạo lại nội dung`.
  - Giới hạn độ dài bài viết tối đa **500 từ / bài**.
  - Không hỗ trợ ghép video nhạc hoặc lưu lịch sử bài viết.

### Gói STARTER (Cá nhân / Newbie)
* **Mục tiêu:** Cá nhân làm web nhỏ, viết bài số lượng ít.
* **Hạn mức đề xuất:**
  - Tối đa **30 - 50 bài viết / tháng**.
  - Độ dài bài viết tối đa **1,800 từ / bài** (theo cài đặt mặc định).
  - Ghép video âm nhạc: Tối đa **5 video / ngày**, chất lượng tiêu chuẩn.

### Gói PRO (Chuyên nghiệp / MMO Creator)
* **Mục tiêu:** Người làm nội dung chuyên sâu, biên tập viên truyện, làm video MMO năng suất cao.
* **Hạn mức đề xuất:**
  - Tối đa **300 - 500 bài viết / tháng**.
  - Sáng tác truyện (`content.story`): Tối đa **5 dự án truyện**, giới hạn tối đa **20 chương / truyện**.
  - Rewrite hàng loạt (`content.bulk_rewrite`): Tối đa **20-50 URLs / lần chạy**.
  - Ghép video âm nhạc: Không giới hạn số lượng, hỗ trợ nhiều mẫu preset nâng cao.

### Gói VIP (Vô hạn & Đặc quyền)
* **Mục tiêu:** Đội nhóm làm MMO lớn, hệ thống xuất bản truyện hoặc khách hàng có nhu cầu tài nguyên cực lớn.
* **Hạn mức đề xuất:**
  - **Không giới hạn** số bài viết / tháng.
  - Sáng tác truyện: Không giới hạn số dự án và chương truyện.
  - Rewrite hàng loạt: Lên tới **1,000 URLs / lần chạy**.
  - Hỗ trợ tính năng nâng cao: Self-Reflection (AI tự sửa lỗi logic truyện), Custom AI Model.
  - Ưu tiên đường truyền xử lý API nhanh nhất (High priority queue).

---

## 3. Cơ chế đăng ký tài khoản tự động nhận gói FREE

Khi một tài khoản người dùng đăng ký mới trên hệ thống, cơ chế SQL trigger sẽ tự động xử lý mà không cần admin phê duyệt thủ công:

1. Sự kiện đăng ký tài khoản trên auth của Supabase kích hoạt trigger `on_auth_user_created`.
2. Hàm trigger `public.handle_new_user()` sẽ chạy để khởi tạo Profile và Role mặc định cho user.
3. Đồng thời, hàm tự động truy vấn ID của gói `free` và chèn bản ghi mới vào bảng `public.licenses` với trạng thái `active`.

---

## 4. Hướng dẫn cập nhật cấu hình hệ thống

Tất cả các định nghĩa về gói và phân quyền đã được đóng gói đầy đủ tại file [supabase/update_plans.sql](file:///e:/All%20in%20one%20mmo/Content%20module/All_in_one_mmo/supabase/update_plans.sql).
Hãy copy mã SQL trong file này và chạy tại **Supabase SQL Editor** để đồng bộ lại dữ liệu.
