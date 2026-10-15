import Link from "next/link";
import { Bookmark } from "lucide-react";
import { mvPath } from "@/features/mau-video/site";

/** Nút "Đã lưu" ở góc tiêu đề (các danh mục đã có trong nav ngang + sidebar, không lặp lại ở đây). */
export function SavedLink() {
  return (
    <Link href={mvPath.saved} className="mv-saved-link" title="Prompt đã lưu trên trình duyệt này">
      <Bookmark size={15} aria-hidden /><span>Đã lưu</span>
    </Link>
  );
}
