import Link from "next/link";
import { mvPath } from "@/features/mau-video/site";

export default function MauVideoNotFound() {
  return (
    <div className="mv-empty" style={{ marginTop: 40 }}>
      <b>Không tìm thấy prompt này</b>
      Prompt hoặc danh mục bạn tìm có thể đã được đổi tên hoặc gỡ bỏ.
      <div style={{ marginTop: 16 }}><Link className="mv-btn-primary" href={mvPath.home}>Về thư viện</Link></div>
    </div>
  );
}
