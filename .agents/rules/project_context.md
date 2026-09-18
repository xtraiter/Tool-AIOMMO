---
description: Bối cảnh dự án (Project Context)
---

# Bối cảnh dự án Tool AIOMMO
- Repository [xtraiter/Tool-AIOMMO](https://github.com/xtraiter/Tool-AIOMMO) trên GitHub là nguồn chân lý duy nhất (single source of truth) cho dự án này.
- Có nhiều máy cùng làm việc trên repo này (máy dev cá nhân, máy chủ nội bộ chạy agent...) — mỗi máy đều có thể push/pull theo cả 2 chiều, không có máy nào cố định là "nguồn" hay "đích".
- Trước khi bắt đầu sửa code trên bất kỳ máy nào: `git pull` trước để lấy thay đổi mới nhất từ các máy khác. Sau khi xong việc: commit rõ ràng rồi `git push` ngay để máy khác đồng bộ được.
